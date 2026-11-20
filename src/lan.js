// A seat belongs to this tab. A reload reconnects to the same suspended run.
const key = 'barrel-bound.cabinet-seat'
function remember(key, token) {
  try {
    if (token) sessionStorage.setItem(key, token)
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
  constructor(stage, mode, onState, onStatus, fresh) {
    this.stage = stage
    this.mode = mode
    this.fresh = fresh
    this.storageKey = mode === 'coop' ? key + '.coop' : key
    this.onState = onState
    this.onStatus = onStatus
    this.token = remembered(this.storageKey)
    this.seat = null
    this.state = null
    this.attempt = 0
    this.lastMask = -1
  }
  open() {
    const url = new URL('/arcade/socket', location.href)
    if (this.mode === 'coop') url.searchParams.set('mode', 'coop')
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(url)
    this.socket = ws
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: 'join', token: this.token, stage: this.stage, fresh: this.fresh }))
    ws.onmessage = (event) => {
      if (this.closed) return
      const data = JSON.parse(event.data)
      if (data.type === 'seat') {
        this.fresh = false
        this.seat = data.seat
        this.invite = data.invite
        this.token = data.token
        remember(this.storageKey, data.token)
        this.attempt = 0
      } else if (data.type === 'ended') {
        this.closed = true
        remember(this.storageKey, null)
        if (data.reason !== 'finished') this.onStatus(data.reason === 'left' ? 'partner-left' : 'expired')
      } else if (data.type === 'full' || data.type === 'replaced') {
        this.closed = true
        this.state = null
        this.onStatus(data.type)
      } else if (data.type === 'state') {
        if (data.turn !== this.state?.turn || data.phase !== this.state?.phase) this.lastMask = -1
        this.state = data
        this.onState(data)
      }
    }
    ws.onclose = () => {
      if (this.closed) return
      this.lastMask = -1
      this.state = null
      this.onStatus('disconnected')
      this.retry = setTimeout(() => this.open(), Math.min(4000, 650 * 2 ** Math.min(this.attempt++, 3)))
    }
  }
  send(type, fields = {}) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type, turn: this.state?.turn, ...fields }))
  }
  get canControl() {
    return this.seat !== null && !!this.state && (this.mode === 'coop' || this.state.active === this.seat)
  }
  keys(mask) {
    if (this.canControl && this.state.phase === 'playing' && this.lastMask !== mask) {
      this.send('keys', { mask })
      this.lastMask = mask
    }
  }
  close() {
    clearTimeout(this.retry)
    if (!this.closed) this.send('leave')
    this.closed = true
    this.socket?.close()
    remember(this.storageKey, null)
  }
}
