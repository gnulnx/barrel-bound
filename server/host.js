import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { createCabinet } from './cabinet.js'
import { levels } from '../src/levels.js'
import { STEP } from '../src/game.js'
import { INPUT_TIMEOUT_MS, PROTOCOL_VERSION } from '../src/protocol.js'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

// The same host is used by npm start and real-socket regression tests.
export function createArcadeHost({
  port = Number(process.env.BARREL_PORT || 4175),
  hostname = '0.0.0.0',
  reconnectMs = 120000,
  inputTimeoutMs = INPUT_TIMEOUT_MS,
} = {}) {
  let closing = false
  const addresses = Object.entries(networkInterfaces()).flatMap(([name, items]) =>
    items.filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, ip: a.address })),
  )
  const lanAddress =
    addresses.find((a) => /^(en0|wlan0|eth0)$/.test(a.name))?.ip ?? addresses[0]?.ip ?? '127.0.0.1'
  function info() {
    const base = 'http://' + lanAddress + ':' + (server.address()?.port ?? port) + '/'
    return { invite: base + '?lan=1', coopInvite: base + '?lan=coop' }
  }
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      if (pathname === '/arcade/info') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(info()))
        return
      }
      const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!path.startsWith(resolve(root) + sep)) {
        res.writeHead(404).end()
        return
      }
      const file = await readFile(path)
      res.writeHead(200, {
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      })
      res.end(req.method === 'HEAD' ? undefined : file)
    } catch {
      res.writeHead(404).end()
    }
  })
  const sockets = new WebSocketServer({ server, path: '/arcade/socket', maxPayload: 1024 })
  const cabinets = { turns: createCabinet('turns'), coop: createCabinet('coop') }
  sockets.on('connection', (socket, request) => {
    socket.on('error', () => socket.terminate())
    // A browser on another site cannot silently take a seat at the cabinet.
    if (request.headers.origin) {
      try {
        if (
          new URL(request.headers.origin).hostname !==
          new URL('http://' + request.headers.host).hostname
        ) {
          socket.close(1008, 'Open the game to join')
          return
        }
      } catch {
        socket.close(1008)
        return
      }
    }
    const mode =
      new URL(request.url, 'http://localhost').searchParams.get('mode') === 'coop'
        ? 'coop'
        : 'turns'
    const { table, seats, online, broadcast, end } = cabinets[mode]
    let seatId = -1
    socket.alive = true
    socket.on('pong', () => {
      socket.alive = true
    })
    const joinDeadline = setTimeout(() => {
      if (seatId < 0) socket.close(1008, 'Join timed out')
    }, 10000)
    socket.on('message', (buffer) => {
      let msg
      try {
        msg = JSON.parse(buffer)
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      if (seatId === -1) {
        if (msg.type !== 'join') return
        if (msg.protocol !== PROTOCOL_VERSION) {
          socket.send(JSON.stringify({ type: 'ended', reason: 'updated' }))
          socket.close(1000, 'Reload the game')
          return
        }
        let old = seats.findIndex((s) => s && s.token === msg.token)
        // An explicit new game is different from reloading or reconnecting a run.
        if (old >= 0 && msg.fresh === true) {
          end('left')
          old = -1
        }
        if (msg.token && old < 0 && msg.fresh !== true) {
          socket.send(JSON.stringify({ type: 'ended', reason: 'expired' }))
          socket.close(1000, 'Previous match ended')
          return
        }
        // Offline seats stay reserved, even if both computers temporarily disconnect.
        const i = old >= 0 ? old : seats.findIndex((s) => s === null)
        if (i < 0) {
          socket.send(JSON.stringify({ type: 'full' }))
          socket.close(1000)
          return
        }
        if (seats.every((s) => s === null))
          table.reset(Number.isInteger(msg.stage) && levels[msg.stage] ? msg.stage : 0)
        const seat = seats[i] ?? { token: randomUUID() }
        if (seat.socket) {
          table.pause()
          seat.socket.send(JSON.stringify({ type: 'replaced' }))
          seat.socket.close(1000)
        }
        clearTimeout(seat.expiry)
        seat.socket = socket
        seat.lastInputAt = performance.now()
        seats[i] = seat
        seatId = i
        clearTimeout(joinDeadline)
        socket.send(
          JSON.stringify({
            type: 'seat',
            seat: i,
            token: seat.token,
            match: table.match,
            mode,
            invite: mode === 'coop' ? info().coopInvite : info().invite,
          }),
        )
        if (online().every(Boolean) && table.phase === 'waiting') table.start()
        broadcast()
        return
      }
      if (seats[seatId]?.socket !== socket) return
      if (msg.type === 'leave') {
        if (!msg.match || msg.match === table.match) end('left')
        return
      }
      if (!online().every(Boolean)) return
      if (table.command(seatId, msg)) {
        if (msg.type === 'play') for (const seat of seats) seat.lastInputAt = performance.now()
        else if (msg.type === 'keys') seats[seatId].lastInputAt = performance.now()
        if (msg.type !== 'keys') broadcast()
      }
    })
    socket.on('close', () => {
      clearTimeout(joinDeadline)
      if (closing || seatId < 0 || seats[seatId]?.socket !== socket) return
      const seat = seats[seatId]
      seat.socket = null
      table.pause()
      seat.expiry = setTimeout(() => {
        if (seats[seatId] === seat && !seat.socket) end('expired')
      }, reconnectMs)
      broadcast()
    })
  })
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) {
        socket.terminate()
        continue
      }
      socket.alive = false
      socket.ping()
    }
  }, 10000)
  heartbeat.unref()
  let previous = performance.now()
  const timer = setInterval(() => {
    const now = performance.now(),
      elapsed = Math.min(0.12, (now - previous) / 1000)
    previous = now
    for (const cabinet of Object.values(cabinets)) {
      const { table, seats } = cabinet
      if (table.phase === 'playing') {
        const needed = table.mode === 'coop' ? [0, 1] : [table.active]
        if (needed.some((i) => now - seats[i].lastInputAt > inputTimeoutMs)) {
          table.pause()
          table.notice = 'Controls disconnected. Check both computers before resuming.'
          cabinet.broadcast()
        }
      }
      if (table.phase !== 'playing') {
        cabinet.accumulator = 0
        continue
      }
      cabinet.accumulator += elapsed
      while (cabinet.accumulator >= STEP && table.phase === 'playing') {
        table.step()
        cabinet.accumulator -= STEP
      }
      if (now >= cabinet.sendAt || table.phase !== 'playing') {
        cabinet.sendAt = now + 32
        cabinet.broadcast()
      }
    }
  }, 10)
  async function listen() {
    await new Promise((ready, reject) => {
      server.once('error', reject)
      server.listen(port, hostname, () => {
        server.removeListener('error', reject)
        ready()
      })
    })
    return 'http://127.0.0.1:' + server.address().port
  }
  async function close() {
    closing = true
    clearInterval(timer)
    clearInterval(heartbeat)
    for (const cabinet of Object.values(cabinets))
      for (const seat of cabinet.seats) clearTimeout(seat?.expiry)
    for (const socket of sockets.clients) socket.terminate()
    sockets.close()
    if (server.listening) {
      await new Promise((done) => {
        server.close(done)
        server.closeAllConnections()
      })
    }
  }
  return { server, sockets, cabinets, listen, close, info }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = createArcadeHost()
  try {
    const url = await host.listen()
    console.log('Title screen  ' + url + '/')
    console.log('Two computers: climb together  ' + host.info().coopInvite)
    console.log('Two computers: take turns  ' + host.info().invite)
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, async () => {
        await host.close()
        process.exit(0)
      })
  } catch (error) {
    console.error('Cannot open the arcade host:', error.message)
    await host.close()
    process.exitCode = 1
  }
}
