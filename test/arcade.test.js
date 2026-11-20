import test from 'node:test'
import assert from 'node:assert/strict'
import { Run, STEP } from '../src/game.js'
import { floorAt, levels } from '../src/levels.js'
import { Table } from '../server/table.js'

const idle = { left: false, right: false, up: false, down: false, jump: false }
test('some barrels pass a ladder and others descend it, land, and roll away', () => {
  const run = new Run(0, 1),
    row = 1,
    x = run.level.routes[0][0]
  const results = new Set()
  for (let id = 0; id < 5; id++) {
    const barrel = {
      id,
      row,
      x: x - 0.02,
      y: floorAt(run.level.rows[row], x) + 0.39,
      dir: 1,
      vy: 0,
      rotation: 0,
      passed: new Set(),
    }
    run.barrels = [barrel]
    run.updateBarrels(STEP)
    results.add(Boolean(barrel.descending))
    if (!barrel.descending) continue
    const top = barrel.y
    run.updateBarrels(0.1)
    assert.equal(barrel.x, x)
    assert.ok(barrel.y < top && barrel.y > floorAt(run.level.rows[0], x) + 0.39)
    const p = run.players[0]
    Object.assign(p, { x, y: barrel.y - 0.4, ladder: 0 })
    run.updateBarrels(STEP)
    assert.equal(p.lives, 2)
    p.lives = 3
    p.protected = 0
    while (barrel.descending) run.updateBarrels(STEP)
    assert.equal(barrel.row, 0)
    assert.equal(barrel.y, floorAt(run.level.rows[0], x) + 0.39)
    run.updateBarrels(STEP)
    assert.ok(barrel.x < x)
  }
  assert.equal(results.size, 2)
})
test('all shortcut ladders are climbable from their actual world coordinates', () => {
  for (const level of levels)
    for (const [row, x] of level.sideLadders ?? []) {
      const r = new Run(level.index, 1),
        p = r.players[0]
      Object.assign(p, { x, row, y: floorAt(level.rows[row], x) })
      for (let i = 0; i < 150; i++) r.updatePlayer(p, { ...idle, up: true }, STEP)
      assert.equal(p.row, row + 1)
      assert.equal(p.checkpointX, x)
    }
})
test('only the active seat moves, hit swaps turns, and stale input cannot carry over', () => {
  const t = new Table()
  t.start()
  t.command(1, { type: 'play', turn: t.turn })
  assert.equal(t.phase, 'ready')
  t.command(0, { type: 'play', turn: t.turn })
  const old = t.turn,
    p = t.runs[0].players[0]
  t.command(1, { type: 'keys', turn: t.turn, mask: 2 })
  const x = p.x
  t.step()
  assert.equal(p.x, x)
  t.command(0, { type: 'keys', turn: t.turn, mask: 2 })
  t.step()
  assert.ok(p.x > x)
  t.runs[0].barrels.push({ id: 35, x: p.x, y: p.y + 0.39, row: 0, dir: 1, rotation: 0, passed: new Set() })
  t.step()
  assert.equal(t.active, 1)
  assert.equal(t.phase, 'ready')
  assert.equal(p.lives, 2)
  const savedTime = t.runs[0].time
  t.command(1, { type: 'play', turn: old })
  assert.equal(t.phase, 'ready')
  t.command(1, { type: 'play', turn: t.turn })
  t.step()
  assert.equal(t.runs[0].time, savedTime)
  assert.equal(t.runs[1].time, STEP)
})
test('bell advances individual progress; an eliminated player watches through the finish', () => {
  const t = new Table(levels.length - 2)
  t.start()
  function play() {
    assert.ok(t.command(t.active, { type: 'play', turn: t.turn }))
  }
  function bell() {
    const r = t.runs[t.active],
      p = r.players[0],
      row = r.level.rows.length - 1,
      x = r.level.goalX
    Object.assign(p, { row, x, y: floorAt(r.level.rows[row], x) })
    t.step()
  }
  play()
  bell()
  assert.equal(t.active, 1)
  assert.equal(t.runs[0].level.index, levels.length - 1)
  assert.ok(t.runs[0].score > 0)
  assert.equal(t.runs[1].score, 0)
  play()
  const r = t.runs[1],
    p = r.players[0]
  p.lives = 1
  r.barrels = [{ id: 9, row: 0, x: p.x, y: p.y + 0.39, dir: 1, rotation: 0, passed: new Set() }]
  t.step()
  assert.equal(t.active, 0)
  assert.equal(t.phase, 'ready')
  assert.equal(r.state, 'over')
  play()
  bell()
  assert.equal(t.phase, 'finished')
  t.start()
  assert.equal(t.runs[0].score, 0)
  assert.equal(t.runs[1].players[0].lives, 3)
})

test('co-op steps both seats together with independent keys, lives and one shared score', () => {
  const table = new Table(0, 'coop')
  table.start()
  const send = (seat, type, mask) => table.command(seat, { type, mask, turn: table.turn })
  send(1, 'play')
  const run = table.runs[0],
    [p1, p2] = run.players,
    x1 = p1.x,
    x2 = p2.x
  send(0, 'keys', 2)
  send(1, 'keys', 1)
  for (let i = 0; i < 20; i++) table.step()
  assert.ok(p1.x > x1 && p2.x < x2)
  send(0, 'keys', 16)
  send(0, 'keys', 0)
  send(1, 'keys', 0)
  table.step()
  assert.ok(!p1.grounded && p2.grounded)
  p1.lives = 1
  run.hit(p1)
  table.step()
  assert.equal(table.phase, 'playing')
  const snapshot = table.snapshot([true, true])
  assert.equal(snapshot.board.players.length, 2)
  assert.deepEqual(
    snapshot.seats.map((s) => s.lives),
    [0, 3],
  )
  const last = run.level.rows.length - 1
  Object.assign(p2, { row: last, x: run.level.goalX, y: floorAt(run.level.rows[last], run.level.goalX) })
  table.step()
  assert.equal(table.phase, 'ready')
  assert.equal(table.runs[0].level.index, 1)
  assert.deepEqual(
    table.runs[0].players.map((p) => p.lives),
    [1, 3],
  )
  assert.equal(table.runs[0].score, run.score)
  assert.ok(run.score > 0)
})
test('co-op pause clears both inputs; either seat can resume and the team wins the final stage', () => {
  const table = new Table(levels.length - 1, 'coop')
  table.start()
  let turn = table.turn
  table.command(0, { type: 'play', turn })
  table.command(1, { type: 'keys', turn, mask: 18 })
  table.command(1, { type: 'pause', turn })
  table.command(0, { type: 'play', turn })
  assert.equal(table.phase, 'paused')
  assert.equal(table.snapshot([true, false]).phase, 'offline')
  turn = table.turn
  table.command(0, { type: 'play', turn })
  const run = table.runs[0],
    p = run.players[1],
    x = p.x
  table.step()
  assert.equal(p.x, x)
  assert.equal(p.grounded, true)
  const row = run.level.rows.length - 1
  Object.assign(p, { row, x: run.level.goalX, y: floorAt(run.level.rows[row], run.level.goalX) })
  table.step()
  assert.equal(table.phase, 'finished')
  assert.equal(table.snapshot([true, true]).board.outcome, 'clear')
  table.start()
  assert.equal(table.runs[0].score, 0)
  assert.deepEqual(
    table.runs[0].players.map((p) => p.lives),
    [3, 3],
  )
})

test('end game and game over release every seat and reset the cabinet in the running host', async () => {
  const { createCabinet } = await import('../server/cabinet.js')
  for (const mode of ['turns', 'coop']) {
    const c = createCabinet(mode),
      seen = []
    for (const reason of ['left', 'finished']) {
      c.table.reset(4)
      c.table.start()
      c.table.runs[0].score = 900
      for (let i = 0; i < 2; i++)
        c.seats[i] = {
          token: 'old' + i,
          socket: {
            readyState: 1,
            bufferedAmount: 0,
            send: (s) => seen.push(JSON.parse(s)),
            close() {
              this.readyState = 3
            },
          },
        }
      if (reason === 'left') c.end(reason)
      else {
        c.table.phase = 'finished'
        c.broadcast()
      }
      assert.deepEqual(c.seats, [null, null])
      assert.equal(c.table.phase, 'waiting')
      assert.equal(c.table.stage, 0)
      assert.deepEqual(c.table.runs, [])
      assert.equal(seen.filter((m) => m.type === 'ended' && m.reason === reason).length, 2)
      if (reason === 'finished')
        assert.ok(seen.some((m) => m.phase === 'finished' && m.board.score === 900))
      c.table.reset(2)
      c.table.start()
      assert.equal(c.table.runs[0].level.index, 2)
      assert.equal(c.table.runs[0].score, 0)
      assert.ok(
        c.table.runs.every(
          (r) => r.time === 0 && r.players.every((p) => p.checkpoint === 0 && p.lives === 3),
        ),
      )
    }
  }
})
