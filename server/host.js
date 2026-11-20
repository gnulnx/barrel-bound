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

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const port = Number(process.env.BARREL_PORT || 4175)
const addresses = Object.entries(networkInterfaces()).flatMap(([name, items]) =>
  items.filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, ip: a.address })),
)
const lanAddress =
  addresses.find((a) => /^(en0|wlan0|eth0)$/.test(a.name))?.ip ?? addresses[0]?.ip ?? '127.0.0.1'
const baseURL = 'http://' + lanAddress + ':' + port + '/'
const invite = baseURL + '?lan=1'
const coopInvite = baseURL + '?lan=coop'
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (pathname === '/arcade/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ invite, coopInvite }))
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
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : file)
  } catch {
    res.writeHead(404).end()
  }
})
const sockets = new WebSocketServer({ server, path: '/arcade/socket', maxPayload: 1024 })
const cabinets = { turns: createCabinet('turns'), coop: createCabinet('coop') }
sockets.on('connection', (socket, request) => {
  // A browser on another site cannot silently take a seat at the cabinet.
  if (request.headers.origin) {
    try {
      if (new URL(request.headers.origin).hostname !== new URL('http://' + request.headers.host).hostname) {
        socket.close(1008, 'Open the game to join')
        return
      }
    } catch {
      socket.close(1008)
      return
    }
  }
  const mode =
    new URL(request.url, 'http://localhost').searchParams.get('mode') === 'coop' ? 'coop' : 'turns'
  const { table, seats, online, broadcast, end } = cabinets[mode]
  let seatId = -1
  socket.alive = true
  socket.on('pong', () => {
    socket.alive = true
  })
  socket.on('error', () => socket.terminate())
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
      const old = seats.findIndex((s) => s && s.token === msg.token)
      if (msg.token && old < 0 && msg.fresh !== true) {
        socket.send(JSON.stringify({ type: 'ended', reason: 'expired' }))
        socket.close(1000, 'Previous match ended')
        return
      }
      if (old < 0 && seats.some(Boolean) && !online().some(Boolean)) end('abandoned')
      const i = old >= 0 ? old : seats.findIndex((s) => s === null)
      if (i < 0) {
        socket.send(JSON.stringify({ type: 'full' }))
        socket.close(1000)
        return
      }
      const first = seats.every((s) => s === null)
      if (first) table.reset(Number.isInteger(msg.stage) && levels[msg.stage] ? msg.stage : 0)
      const seat = seats[i] ?? { token: randomUUID() }
      if (seat.socket) {
        table.pause()
        seat.socket.send(JSON.stringify({ type: 'replaced' }))
        seat.socket.close(1000)
      }
      clearTimeout(seat.expiry)
      seat.socket = socket
      seats[i] = seat
      seatId = i
      clearTimeout(joinDeadline)
      socket.send(
        JSON.stringify({
          type: 'seat',
          seat: i,
          token: seat.token,
          mode,
          invite: mode === 'coop' ? coopInvite : invite,
        }),
      )
      if (online().every(Boolean) && table.phase === 'waiting') table.start()
      broadcast()
      return
    }
    if (seats[seatId]?.socket !== socket) return
    if (msg.type === 'leave') {
      end('left')
      return
    }
    if (!online().every(Boolean)) return
    if (table.command(seatId, msg)) broadcast()
  })
  socket.on('close', () => {
    clearTimeout(joinDeadline)
    if (seatId < 0 || seats[seatId]?.socket !== socket) return
    const seat = seats[seatId]
    seat.socket = null
    table.pause()
    seat.expiry = setTimeout(() => {
      if (seats[seatId] === seat && !seat.socket) end('expired')
    }, 120000)
    broadcast()
  })
})
setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.alive) {
      socket.terminate()
      continue
    }
    socket.alive = false
    socket.ping()
  }
}, 10000).unref()
let previous = performance.now()
setInterval(() => {
  const now = performance.now(),
    elapsed = Math.min(0.12, (now - previous) / 1000)
  previous = now
  for (const cabinet of Object.values(cabinets)) {
    const { table } = cabinet
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
server.on('error', (e) => {
  console.error('Cannot open the arcade host:', e.message)
  process.exit(1)
})
server.listen(port, '0.0.0.0', () => {
  console.log('Title screen  http://127.0.0.1:' + port + '/')
  console.log('Two computers: climb together  ' + coopInvite)
  console.log('Two computers: take turns  ' + invite)
})
