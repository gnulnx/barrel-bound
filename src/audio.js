let ctx,
  master,
  nextBeat = 0,
  step = 0,
  enabled = true,
  playing = false,
  theme = 0
const notes = [0, 7, 10, 7, 12, 7, 5, 3, 0, 3, 7, 10, 7, 5, 3, -2]
export function initAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!ctx && Audio) {
      ctx = new Audio()
      master = ctx.createGain()
      master.gain.value = enabled ? 0.15 : 0
      master.connect(ctx.destination)
    }
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  } catch {
    /* The game can run on devices without audio output. */
  }
}
function tone(freq, length = 0.12, type = 'square', gain = 0.15, start = ctx?.currentTime, endFreq) {
  if (!ctx || !enabled || ctx.state !== 'running') return
  const osc = ctx.createOscillator(),
    vol = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + length)
  vol.gain.setValueAtTime(0.0001, start)
  vol.gain.exponentialRampToValueAtTime(gain, start + 0.007)
  vol.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(vol)
  vol.connect(master)
  osc.start(start)
  osc.stop(start + length + 0.02)
  osc.onended = () => {
    osc.disconnect()
    vol.disconnect()
  }
}
export function mute(on) {
  enabled = !on
  if (master) master.gain.setTargetAtTime(enabled ? 0.15 : 0, ctx.currentTime, 0.015)
}
export function music(on, level = 0) {
  playing = on
  theme = level
  nextBeat = 0
  step = 0
}
export function tickAudio() {
  if (!playing || !enabled || !ctx || ctx.state !== 'running') return
  if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.02
  while (nextBeat < ctx.currentTime + 0.09) {
    const root = [146.83, 130.81, 164.81, 174.61, 155.56, 123.47][theme]
    if (step % 2 === 0) tone(root * 2 ** (notes[(step / 2) % 16] / 12), 0.15, 'triangle', 0.28, nextBeat)
    if (step % 4 === 0) tone(root * 0.5 * (step % 16 >= 8 ? 0.75 : 1), 0.24, 'triangle', 0.35, nextBeat)
    if (step % 4 === 2) tone(83, 0.07, 'triangle', 0.38, nextBeat, 36)
    nextBeat += [0.132, 0.124, 0.116, 0.128, 0.12, 0.112][theme]
    step++
  }
}
export function sfx(kind) {
  if (!ctx) return
  const t = ctx.currentTime
  if (kind === 'jump') tone(220, 0.13, 'square', 0.14, t, 680)
  if (kind === 'coin' || kind === 'vault') {
    tone(660, 0.09, 'square', 0.17)
    tone(990, 0.15, 'triangle', 0.3, t + 0.065)
  }
  if (kind === 'hit') {
    tone(180, 0.24, 'sawtooth', 0.24, t, 42)
    tone(85, 0.2, 'triangle', 0.38)
  }
  if (kind === 'select') tone(425, 0.06, 'square', 0.12)
  if (kind === 'start' || kind === 'clear') {
    ;[0, 4, 7, 12].forEach((n, i) => tone(330 * 2 ** (n / 12), 0.23, 'square', 0.13, t + i * 0.095))
  }
  if (kind === 'over') {
    ;[7, 3, 0, -5].forEach((n, i) => tone(196 * 2 ** (n / 12), 0.24, 'triangle', 0.3, t + i * 0.16))
  }
  if (kind === 'throw') tone(84, 0.09, 'triangle', 0.18, t, 42)
}
