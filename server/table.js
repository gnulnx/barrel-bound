import { Run, STEP } from '../src/game.js'
import { levels } from '../src/levels.js'

const emptyInput = () => ({ left: false, right: false, up: false, down: false, jump: false })

// Turn-taking keeps a frozen run per seat. Co-op steps both explorers in one run.
export class Table {
  constructor(stage = 0, mode = 'turns') {
    this.mode = mode
    this.reset(stage)
  }
  reset(stage = 0) {
    this.stage = stage
    this.runs = []
    this.active = 0
    this.phase = 'waiting'
    this.turn = (this.turn ?? 0) + 1
    this.notice = ''
    this.events = []
    this.clearKeys()
  }
  clearKeys() {
    this.inputs = [emptyInput(), emptyInput()]
    this.jumpTaps = [false, false]
  }
  start() {
    this.runs =
      this.mode === 'coop' ? [new Run(this.stage, 2)] : [new Run(this.stage, 1), new Run(this.stage, 1)]
    this.active = 0
    this.ready('Both players are here.')
  }
  ready(notice) {
    this.phase = 'ready'
    this.notice = notice
    this.turn++
    this.clearKeys()
  }
  pause() {
    if (this.phase === 'playing') {
      this.phase = 'paused'
      this.turn++
      this.clearKeys()
    }
  }
  command(seat, message) {
    if (
      (seat !== 0 && seat !== 1) ||
      (this.mode === 'turns' && seat !== this.active) ||
      message.turn !== this.turn
    )
      return false
    if (message.type === 'play' && (this.phase === 'ready' || this.phase === 'paused')) {
      this.clearKeys()
      this.phase = 'playing'
      this.notice = ''
      return true
    }
    if (this.phase !== 'playing') return false
    if (message.type === 'pause') {
      this.pause()
      return true
    }
    if (
      message.type === 'keys' &&
      Number.isInteger(message.mask) &&
      message.mask >= 0 &&
      message.mask < 32
    ) {
      const mask = message.mask
      if (mask & 16 && !this.inputs[seat].jump) this.jumpTaps[seat] = true
      this.inputs[seat] = {
        left: !!(mask & 1),
        right: !!(mask & 2),
        up: !!(mask & 4),
        down: !!(mask & 8),
        jump: !!(mask & 16),
      }
    }
    return false
  }
  finished(run) {
    return run.state === 'over' || (run.state === 'clear' && run.level.index === levels.length - 1)
  }
  step() {
    if (this.phase !== 'playing') return
    const seat = this.active,
      run = this.runs[seat]
    const inputs = this.inputs.map((input, i) => (this.jumpTaps[i] ? { ...input, jump: true } : input))
    run.step(STEP, this.mode === 'coop' ? inputs : [inputs[seat]])
    this.jumpTaps.fill(false)
    const events = run.events.splice(0)
    this.events.push(...events.map((e) => e.kind))
    if (this.mode === 'coop') {
      if (run.state === 'playing') return
      if (this.finished(run)) {
        this.phase = 'finished'
        this.turn++
        this.clearKeys()
        return
      }
      this.runs[0] = new Run(run.level.index + 1, 2, {
        score: run.score,
        lives: run.players.map((p) => p.lives),
      })
      this.ready('Stage clear!')
      return
    }
    const hit = events.some((e) => e.kind === 'hit')
    if (!hit && run.state === 'playing') return
    const n = 'P' + (seat + 1)
    let notice = n + ' lost a life.'
    if (run.state === 'clear') {
      notice = n + ' rang the bell at ' + run.level.name + '.'
      if (!this.finished(run))
        this.runs[seat] = new Run(run.level.index + 1, 1, {
          score: run.score,
          lives: [run.players[0].lives],
        })
    } else if (run.state === 'over') notice = n + ' is out of lives.'
    if (this.runs.every((r) => this.finished(r))) {
      this.phase = 'finished'
      this.notice = notice
      this.turn++
      this.clearKeys()
      return
    }
    if (!this.finished(this.runs[1 - seat])) this.active = 1 - seat
    this.ready(notice)
  }
  snapshot(online) {
    const run = this.runs[this.active]
    const phase = this.runs.length && !online.every(Boolean) ? 'offline' : this.phase
    return {
      type: 'state',
      mode: this.mode,
      phase,
      turn: this.turn,
      active: this.active,
      stage: run?.level.index ?? this.stage,
      notice: this.notice,
      seats: online.map((connected, i) => {
        const coop = this.mode === 'coop'
        const seatRun = coop ? run : this.runs[i]
        return {
          connected,
          score: seatRun?.score ?? 0,
          lives: seatRun?.players[coop ? i : 0].lives ?? 3,
          stage: seatRun?.level.index ?? this.stage,
        }
      }),
      events: this.events.splice(0),
      board: !run
        ? null
        : {
            outcome: run.state,
            time: run.time,
            score: run.score,
            sinceThrow: run.sinceThrow,
            players: run.players,
            hazards: run.hazards,
            barrels: run.barrels.map(({ passed, ...position }) => position),
            taken: run.coins.reduce((bits, coin, i) => (coin.taken ? bits | (1 << i) : bits), 0),
          },
    }
  }
}
