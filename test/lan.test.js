import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createArcadeHost } from '../server/host.js'
import { PROTOCOL_VERSION } from '../src/protocol.js'
import { floorAt, levels } from '../src/levels.js'

async function hostFor(t, options = {}) {
  const host = createArcadeHost({ port: 0, hostname: '127.0.0.1', ...options })
  host.url = await host.listen()
  t.after(() => host.close())
  return host
}
async function connect(t, host, mode = 'turns', fields = {}) {
  const socket = new WebSocket(host.url.replace('http:', 'ws:') + '/arcade/socket?mode=' + mode)
  const messages = []
  socket.on('message', (data) => messages.push(JSON.parse(data)))
  t.after(() => socket.terminate())
  await once(socket, 'open')
  socket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, fresh: true, ...fields }))
  function wait(predicate, from = 0) {
    return until(
      () => messages.slice(from).find(predicate),
      () => JSON.stringify(messages.slice(-3)),
    )
  }
  function send(type, fields = {}) {
    const state = messages.findLast((m) => m.type === 'state')
    socket.send(JSON.stringify({ type, match: state?.match, turn: state?.turn, ...fields }))
  }
  return { socket, messages, wait, send }
}
async function until(predicate, detail = () => '') {
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    const result = predicate()
    if (result) return result
    await new Promise((done) => setTimeout(done, 5))
  }
  assert.fail('Timed out: ' + detail())
}
async function pair(t, host, mode = 'turns', stage = 0) {
  const a = await connect(t, host, mode, { stage })
  const seatA = await a.wait((m) => m.type === 'seat')
  const b = await connect(t, host, mode)
  const seatB = await b.wait((m) => m.type === 'seat')
  await Promise.all([a, b].map((p) => p.wait((m) => m.phase === 'ready')))
  return { a, b, seatA, seatB, cabinet: host.cabinets[mode] }
}
function ring(run, player = 0) {
  const p = run.players[player],
    row = run.level.rows.length - 1,
    x = run.level.goalX
  Object.assign(p, {
    row,
    x,
    y: floorAt(run.level.rows[row], x),
    ladder: null,
    grounded: true,
    vx: 0,
  })
}

for (const mode of ['turns', 'coop']) {
  test(mode + ': reload reclaims the same paused run and clears both controls', async (t) => {
    const host = await hostFor(t)
    const { a, b, seatB, cabinet } = await pair(t, host, mode, 2)
    a.send('play')
    await b.wait((m) => m.phase === 'playing')
    a.send('keys', { mask: 2 })
    b.send('keys', { mask: 1 })
    await until(() => cabinet.table.runs[0].time > 0.04)
    b.socket.terminate()
    await a.wait((m) => m.phase === 'offline')
    const run = cabinet.table.runs[0],
      frozen = JSON.stringify(run)
    await new Promise((done) => setTimeout(done, 45))
    assert.equal(JSON.stringify(run), frozen)
    const replacement = await connect(t, host, mode, { token: seatB.token, fresh: false, stage: 5 })
    const seat = await replacement.wait((m) => m.type === 'seat')
    const state = await replacement.wait((m) => m.phase === 'paused')
    assert.equal(seat.seat, 1)
    assert.equal(seat.match, seatB.match)
    assert.equal(state.stage, 2)
    assert.equal(JSON.stringify(run), frozen)
    assert.ok(cabinet.table.inputs.every((input) => Object.values(input).every((v) => !v)))
    a.send('play')
    await replacement.wait((m) => m.phase === 'playing')
    assert.equal(cabinet.table.runs[0], run)
  })

  test(
    mode + ': explicit new game with an old token ends the old match and resets everything',
    async (t) => {
      const host = await hostFor(t)
      const { a, b, seatA, seatB, cabinet } = await pair(t, host, mode, 3)
      const oldMatch = cabinet.table.match
      cabinet.table.runs[0].score = 5500
      Object.assign(cabinet.table.runs[0].players[0], { lives: 1, checkpoint: 2, checkpointX: 3 })
      cabinet.table.runs[0].coins[0].taken = true
      cabinet.table.runs[0].time = 88
      a.socket.terminate()
      await b.wait((m) => m.phase === 'offline')
      const fresh = await connect(t, host, mode, { token: seatA.token, fresh: true, stage: 4 })
      await b.wait((m) => m.type === 'ended' && m.reason === 'left')
      const seat = await fresh.wait((m) => m.type === 'seat')
      assert.notEqual(seat.match, oldMatch)
      assert.notEqual(seat.token, seatA.token)
      await fresh.wait((m) => m.phase === 'waiting')
      const stale = await connect(t, host, mode, { token: seatB.token, fresh: false })
      await stale.wait((m) => m.type === 'ended' && m.reason === 'expired')
      const partner = await connect(t, host, mode)
      await partner.wait((m) => m.phase === 'ready')
      assert.equal(cabinet.table.stage, 4)
      for (const run of cabinet.table.runs) {
        assert.equal(run.time, 0)
        assert.equal(run.score, 0)
        assert.ok(run.coins.every((coin) => !coin.taken))
        assert.ok(run.players.every((p) => p.lives === 3 && p.checkpoint === 0))
        assert.equal(run.barrels.length, 1)
      }
      fresh.send('play', { match: oldMatch })
      await new Promise((done) => setTimeout(done, 25))
      assert.equal(cabinet.table.phase, 'ready')
      fresh.send('play')
      await partner.wait((m) => m.phase === 'playing')
    },
  )

  test(mode + ': a silent control connection pauses before movement can stay stuck', async (t) => {
    const host = await hostFor(t, { inputTimeoutMs: 120 })
    const { a, b, cabinet } = await pair(t, host, mode)
    a.send('play')
    await b.wait((m) => m.phase === 'playing')
    const refresh = setInterval(() => {
      a.send('keys', { mask: 2 })
      b.send('keys', { mask: 0 })
    }, 25)
    t.after(() => clearInterval(refresh))
    await new Promise((done) => setTimeout(done, 220))
    assert.equal(cabinet.table.phase, 'playing')
    clearInterval(refresh)
    const paused = await a.wait((m) => m.phase === 'paused')
    assert.match(paused.notice, /Controls disconnected/)
    assert.ok(cabinet.table.inputs.every((input) => Object.values(input).every((v) => !v)))
    const time = cabinet.table.runs[0].time
    await new Promise((done) => setTimeout(done, 40))
    assert.equal(cabinet.table.runs[0].time, time)
    assert.equal(a.socket.readyState, WebSocket.OPEN)
    assert.equal(b.socket.readyState, WebSocket.OPEN)
  })

  test(mode + ': both offline seats remain reserved; expiry releases them together', async (t) => {
    const host = await hostFor(t, { reconnectMs: 300 })
    const { a, b, cabinet } = await pair(t, host, mode)
    const match = cabinet.table.match
    a.socket.terminate()
    b.socket.terminate()
    await until(() => !cabinet.online().some(Boolean))
    const intruder = await connect(t, host, mode)
    await intruder.wait((m) => m.type === 'full')
    assert.equal(cabinet.table.match, match)
    await until(() => cabinet.seats.every((s) => s === null))
    assert.equal(cabinet.table.phase, 'waiting')
    const newcomer = await connect(t, host, mode, { stage: 1 })
    const state = await newcomer.wait((m) => m.phase === 'waiting')
    assert.equal(state.stage, 1)
    assert.notEqual(state.match, match)
  })
}

test('turn-taking freezes individual score, checkpoint, lives, time and stage across handoffs', async (t) => {
  const host = await hostFor(t)
  const { a, b, cabinet } = await pair(t, host)
  const table = cabinet.table
  b.send('play')
  await new Promise((done) => setTimeout(done, 25))
  assert.equal(table.phase, 'ready')
  a.send('play')
  await b.wait((m) => m.phase === 'playing')
  const runA = table.runs[0]
  runA.score = 750
  Object.assign(runA.players[0], { checkpoint: 1, checkpointX: 2, protected: 0 })
  runA.hit(runA.players[0])
  await b.wait((m) => m.phase === 'ready' && m.active === 1)
  const frozen = JSON.stringify(runA)
  b.send('play')
  await b.wait((m) => m.phase === 'playing' && m.active === 1)
  await until(() => table.runs[1].time > 0.03)
  assert.equal(JSON.stringify(runA), frozen)
  assert.equal(table.runs[1].score, 0)
  assert.equal(table.runs[1].players[0].lives, 3)
  ring(table.runs[1])
  await a.wait((m) => m.phase === 'ready' && m.active === 0 && m.seats[1].stage === 1)
  assert.equal(table.runs[0].score, 750)
  assert.equal(table.runs[0].players[0].lives, 2)
  assert.equal(table.runs[0].players[0].checkpoint, 1)
  assert.equal(table.runs[0].level.index, 0)
})

test('co-op can finish from either seat; final results release seats before a new game', async (t) => {
  const host = await hostFor(t)
  const { a, b, cabinet } = await pair(t, host, 'coop', levels.length - 1)
  b.send('play')
  await a.wait((m) => m.phase === 'playing')
  ring(cabinet.table.runs[0], 1)
  const finalA = await a.wait((m) => m.phase === 'finished')
  const finalB = await b.wait((m) => m.phase === 'finished')
  await a.wait((m) => m.type === 'ended' && m.reason === 'finished')
  await b.wait((m) => m.type === 'ended' && m.reason === 'finished')
  assert.equal(finalA.board.outcome, 'clear')
  assert.deepEqual(finalA, finalB)
  assert.deepEqual(cabinet.seats, [null, null])
  const fresh = await pair(t, host, 'coop', 1)
  assert.ok(fresh.cabinet.table.runs[0].players.every((p) => p.lives === 3))
  assert.equal(fresh.cabinet.table.runs[0].score, 0)
})

test('co-op and alternating cabinets are isolated; old clients are asked to reload', async (t) => {
  const host = await hostFor(t)
  const coop = await pair(t, host, 'coop', 4)
  const turns = await pair(t, host, 'turns', 1)
  coop.a.send('leave')
  await coop.b.wait((m) => m.type === 'ended')
  assert.equal(turns.cabinet.table.phase, 'ready')
  assert.equal(turns.cabinet.table.stage, 1)
  const old = await connect(t, host, 'coop', { protocol: undefined })
  await old.wait((m) => m.type === 'ended' && m.reason === 'updated')
  assert.deepEqual(host.cabinets.coop.seats, [null, null])
})

test('bad packets cannot change a running match, and HTTP never exposes source files', async (t) => {
  const host = await hostFor(t)
  const { a, cabinet } = await pair(t, host)
  for (const message of ['{', 'null', '5', '[]', '{"type":"keys","mask":999999}'])
    a.socket.send(message)
  a.send('play')
  await a.wait((m) => m.phase === 'playing')
  a.send('keys', { mask: 32 })
  a.send('keys', { mask: -1 })
  a.send('keys', { mask: 2.5 })
  await new Promise((done) => setTimeout(done, 25))
  assert.ok(Object.values(cabinet.table.inputs[0]).every((v) => !v))
  for (const path of ['/server/host.js', '/.git/config', '/%2e%2e%2fpackage.json'])
    assert.equal((await fetch(host.url + path)).status, 404)
  const info = await fetch(host.url + '/arcade/info')
  assert.equal(info.status, 200)
  assert.match((await info.json()).coopInvite, /\?lan=coop$/)
})
