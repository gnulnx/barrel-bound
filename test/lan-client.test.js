import test from 'node:test'
import assert from 'node:assert/strict'
import { Cabinet } from '../src/lan.js'
import { INPUT_REFRESH_MS } from '../src/protocol.js'

function clientFor(t, fresh = true) {
  const originals = Object.fromEntries(
    ['WebSocket', 'location', 'sessionStorage'].map((k) => [k, globalThis[k]]),
  )
  const storage = new Map(),
    sockets = [],
    states = [],
    statuses = []
  class Socket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    readyState = 0
    sent = []
    constructor() {
      sockets.push(this)
    }
    send(text) {
      this.sent.push(JSON.parse(text))
    }
    close() {
      this.readyState = 3
      this.onclose?.()
    }
    open() {
      this.readyState = 1
      this.onopen()
    }
    receive(data) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }
  globalThis.WebSocket = Socket
  globalThis.location = new URL('http://localhost:4175/')
  globalThis.sessionStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, value) => storage.set(k, value),
    removeItem: (k) => storage.delete(k),
  }
  const make = (fresh) =>
    new Cabinet(
      2,
      'coop',
      (s) => states.push(s),
      (s) => statuses.push(s),
      fresh,
    )
  const client = make(fresh)
  t.after(() => {
    client.close()
    for (const [k, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[k]
      else globalThis[k] = value
    }
  })
  const seat = (socket, token = 'token', match = 'match') =>
    socket.receive({ type: 'seat', seat: 0, token, match })
  const state = (socket, fields = {}) =>
    socket.receive({
      type: 'state',
      match: 'match',
      active: 0,
      turn: 3,
      phase: 'playing',
      ...fields,
    })
  return { client, storage, sockets, states, statuses, make, seat, state }
}

test('cancelling a connecting client prevents late join callbacks and future retries', (t) => {
  const { client, sockets } = clientFor(t)
  client.open()
  client.close()
  sockets[0].open()
  client.open()
  assert.equal(sockets.length, 1)
  assert.deepEqual(sockets[0].sent, [])
})

test('late messages from a previous connection cannot replace the current match', (t) => {
  const { client, sockets, seat, state, states } = clientFor(t)
  client.open()
  sockets[0].open()
  seat(sockets[0])
  state(sockets[0])
  sockets[0].close()
  client.open()
  sockets[1].open()
  seat(sockets[1], 'new-token', 'new-match')
  state(sockets[1], { match: 'new-match', turn: 8 })
  seat(sockets[0], 'old-token', 'old-match')
  state(sockets[0], { match: 'old-match', turn: 1 })
  state(sockets[1], { match: 'wrong-match', turn: 99 })
  assert.equal(client.token, 'new-token')
  assert.equal(client.state.turn, 8)
  assert.equal(states.length, 2)
})

test('leaving during a lost connection remembers cancellation instead of resuming the old game', (t) => {
  const { client, sockets, seat, state, storage, make } = clientFor(t)
  client.open()
  sockets[0].open()
  seat(sockets[0])
  state(sockets[0])
  sockets[0].close()
  client.close()
  const next = make(false)
  t.after(() => next.close())
  next.open()
  sockets[1].open()
  assert.equal(sockets[1].sent[0].token, 'token')
  assert.equal(sockets[1].sent[0].fresh, true)
  seat(sockets[1], 'fresh-token')
  assert.equal(next.fresh, false)
  assert.equal(storage.get(next.leavingKey), undefined)
})

test('a replaced tab clears its token and cannot end the replacement tab match', (t) => {
  const { client, sockets, seat, state, storage, statuses } = clientFor(t)
  client.open()
  sockets[0].open()
  seat(sockets[0])
  state(sockets[0])
  sockets[0].receive({ type: 'replaced' })
  const sent = sockets[0].sent.length
  client.close()
  assert.equal(sockets[0].sent.length, sent)
  assert.equal(client.canControl, false)
  assert.equal(storage.get(client.storageKey), undefined)
  assert.deepEqual(statuses, ['replaced'])
})

test('held controls refresh while playing and stop completely when a game closes', async (t) => {
  const { client, sockets, seat, state } = clientFor(t)
  client.open()
  sockets[0].open()
  seat(sockets[0])
  state(sockets[0])
  client.keys(18)
  await new Promise((done) => setTimeout(done, INPUT_REFRESH_MS + 40))
  assert.ok(sockets[0].sent.filter((m) => m.type === 'keys' && m.mask === 18).length >= 2)
  assert.ok(
    sockets[0].sent
      .filter((m) => m.type === 'keys')
      .every((m) => m.match === 'match' && m.turn === 3),
  )
  client.close()
  const sent = sockets[0].sent.length
  await new Promise((done) => setTimeout(done, INPUT_REFRESH_MS + 40))
  assert.equal(sockets[0].sent.length, sent)
})
