import { INPUT_REFRESH_MS, PROTOCOL_VERSION } from './protocol.js'

// A seat belongs to this tab. Reloads reconnect; explicit new games start fresh.
const key = 'barrel-bound.cabinet-seat'
function remember(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {}
}
function remembered(key) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export class Cabinet {
  constructor(stage, mode, onState, onStatus, fresh = true) {
    this.stage = stage
    this.mode = mode
    this.storageKey = mode === 'coop' ? key + '.coop' : key
    this.leavingKey = this.storageKey + '.left'
    this.fresh = fresh || remembered(this.leavingKey) === '1'
    this.onState = onState
    this.onStatus = onStatus
    this.token = remembered(this.storageKey)
    this.seat = null
    this.match = null
    this.state = null
    this.attempt = 0
    this.lastMask = -1
    this.closed = false
  }
  open() {
    if (this.closed || this.socket?.readyState < WebSocket.CLOSING) return
    clearTimeout(this.retry)
    const url = new URL('/arcade/socket', location.href)
    if (this.mode === 'coop') url.searchParams.set('mode', 'coop')
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(url)
    this.socket = ws
    ws.onopen = () => {
      if (this.closed || this.socket !== ws) {
        ws.close()
        return
      }
      ws.send(
        JSON.stringify({
          type: 'join',
          protocol: PROTOCOL_VERSION,
          token: this.token,
          stage: this.stage,
          fresh: this.fresh,
        }),
      )
      clearInterval(this.heartbeat)
      this.heartbeat = setInterval(
        () => this.keys(Math.max(0, this.lastMask), true),
        INPUT_REFRESH_MS,
      )
    }
    ws.onmessage = (event) => {
      if (this.closed || this.socket !== ws) return
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      if (!data || typeof data !== 'object') return
      if (data.type === 'seat') {
        this.fresh = false
        this.seat = data.seat
        this.match = data.match
        this.invite = data.invite
        this.token = data.token
        remember(this.storageKey, data.token)
        remember(this.leavingKey, null)
        this.attempt = 0
      } else if (data.type === 'ended' || data.type === 'full' || data.type === 'replaced') {
        this.closed = true
        clearTimeout(this.retry)
        clearInterval(this.heartbeat)
        remember(this.storageKey, null)
        remember(this.leavingKey, null)
        this.token = null
        if (data.type !== 'ended') {
          this.state = null
          this.onStatus(data.type)
        } else if (data.reason !== 'finished') {
          this.state = null
          this.onStatus(
            data.reason === 'left'
              ? 'partner-left'
              : data.reason === 'updated'
                ? 'updated'
                : 'expired',
          )
        }
      } else if (data.type === 'state' && data.match === this.match) {
        if (data.turn !== this.state?.turn || data.phase !== this.state?.phase) this.lastMask = -1
        this.state = data
        this.onState(data)
        if (this.lastMask < 0) this.keys(0)
      }
    }
    ws.onerror = () => {} // A failed connection is reported by onclose and retried.
    ws.onclose = () => {
      if (this.socket !== ws) return
      clearInterval(this.heartbeat)
      if (this.closed) return
      this.lastMask = -1
      this.state = null
      this.onStatus('disconnected')
      this.retry = setTimeout(
        () => this.open(),
        Math.min(4000, 650 * 2 ** Math.min(this.attempt++, 3)),
      )
    }
  }
  send(type, fields = {}) {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify({ type, match: this.match, turn: this.state?.turn, ...fields }))
    return true
  }
  get canControl() {
    return (
      !this.closed &&
      this.seat !== null &&
      !!this.state &&
      (this.mode === 'coop' || this.state.active === this.seat)
    )
  }
  keys(mask, refresh = false) {
    if (this.canControl && this.state.phase === 'playing' && (refresh || this.lastMask !== mask)) {
      if (this.send('keys', { mask })) this.lastMask = mask
    }
  }
  close() {
    clearTimeout(this.retry)
    clearInterval(this.heartbeat)
    if (!this.closed) {
      // Retain a cancellation marker until the host confirms it. If Wi-Fi drops
      // while leaving, the next join can end that old match instead of resuming it.
      remember(this.leavingKey, this.token ? '1' : null)
      this.send('leave')
    }
    this.closed = true
    this.socket?.close()
  }
}
