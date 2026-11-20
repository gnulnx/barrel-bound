import { levels, floorAt } from './levels.js'

export const STEP = 1 / 100
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step))
const idle = { left: false, right: false, up: false, down: false, jump: false }
export class Run {
  constructor(index, count, { score = 0, lives = [] } = {}) {
    this.level = levels[index]
    this.time = 0
    this.score = score
    this.state = 'playing'
    this.events = []
    this.serial = 0
    this.spawnTimer = 1.8
    this.sinceThrow = 2
    const warmupRow = this.level.rows[1]
    this.barrels = [
      {
        id: this.serial++,
        x: 0,
        row: 1,
        dir: -Math.sign(warmupRow.tilt),
        y: floorAt(warmupRow, 0) + 0.39,
        falling: false,
        vy: 0,
        rotation: 0,
        passed: new Set(),
      },
    ]
    this.hazards = this.makeHazards()
    this.coins = this.level.coinSpots.map((c, i) => ({
      ...c,
      id: i,
      y: floorAt(this.level.rows[c.row], c.x) + c.offset,
      taken: false,
    }))
    this.players = Array.from({ length: count }, (_, i) => {
      const p = {
        id: i,
        lives: Math.max(1, lives[i] ?? 3),
        checkpoint: 0,
        checkpointX: this.level.spawnX - Math.sign(this.level.spawnX) * i * 0.82,
        facing: 1,
        walk: 0,
      }
      this.respawn(p)
      p.protected = 0
      return p
    })
  }
  makeHazards() {
    const { biome, traps } = this.level
    if (biome === 'forest') return []
    return (
      traps ??
      (biome === 'forge'
        ? [
            { row: 1, x: -1.8 },
            { row: 3, x: 2.8 },
          ]
        : [
            { row: 1, x: 2.2 },
            { row: 2, x: -2.8 },
            { row: 3, x: 3.1 },
          ])
    ).map((h, i) => ({ ...h, phase: i * 1.9, active: false, warn: false, y: 0 }))
  }
  emit(kind, data = {}) {
    this.events.push({ kind, ...data })
  }
  respawn(p) {
    const x = p.checkpointX,
      row = p.checkpoint
    Object.assign(p, {
      x,
      y: floorAt(this.level.rows[row], x),
      row,
      grounded: true,
      vx: 0,
      vy: 0,
      ladder: null,
      protected: 2.4,
      buffer: 0,
      jumpHeld: false,
      climbing: 0,
      facing: x > 0 ? -1 : 1,
    })
  }
  hit(p) {
    if (p.protected > 0 || p.lives <= 0) return
    p.lives--
    this.emit('hit', { player: p.id })
    if (p.lives > 0) this.respawn(p)
    else if (this.players.every((other) => other.lives === 0)) {
      this.state = 'over'
      this.emit('over')
    }
  }
  scoreAt(amount, x, y, kind) {
    this.score += amount
    this.emit(kind, { amount, x, y })
  }
  updatePlayer(p, input, dt) {
    if (!p.lives) return
    p.protected = Math.max(0, p.protected - dt)
    const { rows, routes } = this.level
    const axis = Number(input.right) - Number(input.left)
    const vertical = Number(input.up) - Number(input.down)
    if (input.jump && !p.jumpHeld) p.buffer = 0.14
    p.jumpHeld = input.jump
    p.buffer = Math.max(0, p.buffer - dt)
    if (p.ladder === null && p.grounded && vertical) {
      const i = vertical > 0 ? p.row : p.row - 1
      const x = routes[i]?.find((x) => Math.abs(p.x - x) < 0.74)
      if (x !== undefined) {
        p.ladder = i
        p.x = x
        p.grounded = false
        p.vx = 0
        p.vy = 0
        p.buffer = 0
      }
    }
    if (p.ladder !== null) {
      const i = p.ladder,
        x = p.x
      const bottom = floorAt(rows[i], x),
        top = floorAt(rows[i + 1], x)
      p.y += vertical * dt * 3.65
      p.climbing += Math.abs(vertical) * dt * 9
      if (p.y >= top || p.y <= bottom) {
        p.row = p.y >= top ? i + 1 : i
        p.y = floorAt(rows[p.row], x)
        p.ladder = null
        p.grounded = true
        if (p.row > p.checkpoint) {
          p.checkpoint = p.row
          p.checkpointX = x
          this.score += 100
          this.emit('climb', { player: p.id })
        }
      }
      return
    }
    const onIce = this.level.biome === 'ice'
    const accel = p.grounded ? (onIce ? (axis ? 17 : 8) : 48) : 25
    p.vx = toward(p.vx, axis * 5.75, accel * dt)
    if (axis) p.facing = axis
    const row = rows[p.row]
    p.x = clamp(p.x + p.vx * dt, row.left + 0.28, row.right - 0.28)
    const ground = floorAt(row, p.x)
    if (p.grounded && p.buffer > 0) {
      p.vy = 8.25
      p.grounded = false
      p.buffer = 0
      this.emit('jump', { player: p.id })
    }
    if (!p.grounded) {
      p.vy -= 22 * dt
      p.y += p.vy * dt
      if (p.y <= ground && p.vy <= 0) {
        p.y = ground
        p.grounded = true
        p.vy = 0
      }
    } else p.y = ground
    p.walk += Math.abs(p.vx) * dt * 2.45
    if (
      p.row === rows.length - 1 &&
      Math.abs(p.x - this.level.goalX) < 0.72 &&
      Math.abs(p.y - ground) < 1.2
    ) {
      this.bonus = Math.max(150, 1000 - Math.floor(this.time) * 5)
      this.score += this.bonus
      this.state = 'clear'
      this.emit('clear', { player: p.id })
    }
  }
  spawnBarrel() {
    const { rows, goalX } = this.level
    const row = rows.length - 1,
      x = goalX * 0.77,
      dir = goalX < 0 ? 1 : -1
    this.barrels.push({
      id: this.serial++,
      x,
      row,
      dir,
      y: floorAt(rows[row], x) + 0.39,
      falling: false,
      vy: 0,
      rotation: 0,
      passed: new Set(),
    })
    this.sinceThrow = 0
    this.emit('throw')
  }
  updateBarrels(dt) {
    const { rows, speed } = this.level
    for (const b of this.barrels) {
      b.rotation -= b.dir * speed * dt * 2.5
      if (b.descending) {
        const target = floorAt(rows[b.row], b.x) + 0.39
        b.y = Math.max(target, b.y - speed * 0.84 * dt)
        if (b.y <= target) {
          b.descending = false
          b.dir = -Math.sign(rows[b.row].tilt)
        }
      } else if (b.falling) {
        b.vy -= 16 * dt
        b.y += b.vy * dt
        if (b.row >= 0) {
          const next = rows[b.row],
            target = floorAt(next, b.x) + 0.39
          if (b.y <= target) {
            b.y = target
            b.falling = false
            b.x = clamp(b.x, next.left + 0.15, next.right - 0.15)
            b.vy = 0
          }
        }
      } else {
        const row = rows[b.row]
        const from = b.x
        b.x += speed * b.dir * dt
        b.y = floorAt(row, b.x) + 0.39
        // Decide once when the barrel crosses a ladder mouth. Keep the other barrels rolling.
        const ladder = this.level.routes[b.row - 1]?.find(
          (x) => (x - from) * b.dir > 0 && (x - b.x) * b.dir <= 0,
        )
        if (ladder !== undefined && (b.id * 7 + b.row * 3 + Math.round(Math.abs(ladder) * 10)) % 5 < 2) {
          b.x = ladder
          b.y = floorAt(row, ladder) + 0.39
          b.row--
          b.descending = true
        } else if (b.x <= row.left + 0.14 || b.x >= row.right - 0.14) {
          b.falling = true
          b.vy = -0.5
          b.row--
          b.dir *= -1
        }
      }
      for (const p of this.players) {
        if (!p.lives || p.protected > 0) continue
        const dx = Math.abs(p.x - b.x),
          dy = p.y - b.y
        if (dx < 0.54 && dy < 0.27 && dy > -0.86) {
          this.hit(p)
          continue
        }
        if (
          !b.falling &&
          !b.descending &&
          b.row === p.row &&
          p.ladder === null &&
          !p.grounded &&
          dx < 0.49 &&
          dy > 0.27 &&
          !b.passed.has(p.id)
        ) {
          b.passed.add(p.id)
          this.scoreAt(100, p.x, p.y + 1.6, 'vault')
        }
      }
    }
    this.barrels = this.barrels.filter((b) => b.y > -3.5)
  }
  updateHazards(dt) {
    for (const h of this.hazards) {
      const mine = this.level.biome === 'forge',
        cycle = mine ? 5.4 : 4.7
      h.phase = (h.phase + dt) % cycle
      h.warn = h.phase > cycle - 1.8 && h.phase < cycle - 0.78
      h.active = h.phase >= cycle - 0.78
      const ground = floorAt(this.level.rows[h.row], h.x)
      h.y = ground + (mine ? 0 : 2.6 - 3.75 * (h.phase - (cycle - 0.78)))
      if (h.active)
        for (const p of this.players) {
          if (!p.lives || Math.abs(p.x - h.x) > 0.52) continue
          if (mine ? p.y < ground + 1.1 && p.y + 0.6 > ground : h.y > p.y - 0.1 && h.y < p.y + 1.2)
            this.hit(p)
        }
    }
  }
  step(dt, inputs = []) {
    if (this.state !== 'playing') return
    this.time += dt
    this.sinceThrow += dt
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnBarrel()
      this.spawnTimer += this.level.interval
    }
    for (const p of this.players) {
      this.updatePlayer(p, inputs[p.id] ?? idle, dt)
      for (const c of this.coins) {
        if (p.lives && !c.taken && Math.abs(p.x - c.x) < 0.56 && Math.abs(p.y + 0.65 - c.y) < 0.75) {
          c.taken = true
          this.scoreAt(50, c.x, c.y + 0.55, 'coin')
        }
      }
      if (this.state !== 'playing') return
    }
    this.updateBarrels(dt)
    if (this.state === 'playing') this.updateHazards(dt)
  }
}
