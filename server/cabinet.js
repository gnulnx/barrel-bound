import { WebSocket } from 'ws'
import { Table } from './table.js'

export function createCabinet(mode) {
  const table = new Table(0, mode),
    seats = [null, null]
  const online = () => seats.map((s) => s?.socket?.readyState === WebSocket.OPEN)
  function broadcast() {
    const packet = table.snapshot(online())
    const state = JSON.stringify(packet)
    for (const seat of seats)
      if (
        seat?.socket?.readyState === WebSocket.OPEN &&
        (packet.phase !== 'playing' || seat.socket.bufferedAmount < 131072)
      )
        seat.socket.send(state)
    if (packet.phase === 'finished') end('finished')
  }
  function end(reason) {
    const members = seats.splice(0, 2, null, null)
    table.reset()
    cabinet.accumulator = 0
    cabinet.sendAt = 0
    for (const seat of members) {
      if (!seat) continue
      clearTimeout(seat.expiry)
      if (seat.socket?.readyState === WebSocket.OPEN) {
        seat.socket.send(JSON.stringify({ type: 'ended', reason }))
        seat.socket.close(1000, 'Match ended')
      }
    }
  }
  const cabinet = { table, seats, online, broadcast, end, accumulator: 0, sendAt: 0 }
  return cabinet
}
