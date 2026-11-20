import './style.css'
import { levels, pad } from './levels.js'
import { Cabinet } from './lan.js'
import { Run, STEP } from './game.js'
import { paintIcon, paintIcons } from './icons.js'
import { initAudio, mute, music, tickAudio, sfx } from './audio.js'

const $ = (id) => document.getElementById(id)
const lobby = $('lobby'),
  game = $('game'),
  modal = $('modal'),
  body = $('modal-body'),
  viewport = $('viewport')
const pressed = new Set()
let stage = 0,
  count = 1,
  run,
  world,
  mode = 'lobby',
  loading = false,
  launchId = 0,
  previousTime = 0,
  accum = 0,
  noticeTimer
let cabinet = null,
  lanView = '',
  lanScreen = '',
  lanMusic = ''
let lastScore = -1,
  lastLives = '',
  helpReturn = 'lobby',
  restoreFocus = null
function read(key, fallback) {
  try {
    return localStorage.getItem('barrel-bound.' + key) ?? fallback
  } catch {
    return fallback
  }
}
function save(key, value) {
  try {
    localStorage.setItem('barrel-bound.' + key, value)
  } catch {
    /* Private sessions can still play. */
  }
}
let best = Math.max(0, Number(read('best', '0')) || 0),
  sound = read('sound', 'on') !== 'off'
function updateSound() {
  mute(!sound)
  paintIcon($('sound').querySelector('canvas'), sound ? 'sound' : 'mute')
  $('sound').setAttribute('aria-label', sound ? 'Mute sound' : 'Enable sound')
  $('sound').setAttribute('aria-pressed', String(sound))
  $('sound').title = sound ? 'Mute sound' : 'Enable sound'
}
function commitBest() {
  const score = cabinet ? cabinet.state?.seats[cabinet.seat]?.score : run?.score
  if (score > best) {
    best = score
    save('best', best)
    $('best').textContent = pad(best, 6)
  }
}
function renderCards() {
  $('stage-cards').innerHTML = levels
    .map(
      (l, i) =>
        `<button class="stage-card" data-stage="${i}" aria-pressed="${i === stage}" aria-label="Stage ${i + 1}, ${l.name}, ${l.difficulty}" style="--difficulty:${l.accent}"><img class="card-art" src="/art/${l.art}-thumb.webp" alt=""><span class="card-copy"><span class="card-meta">STAGE ${pad(i + 1)}</span><strong class="card-title">${l.name}</strong><span class="difficulty"><span class="meter" aria-hidden="true">${[0, 1, 2].map((n) => `<i class="${n <= ['Easy', 'Medium', 'Hard'].indexOf(l.difficulty) ? 'lit' : ''}"></i>`).join('')}</span>${l.difficulty.toUpperCase()}</span></span><span class="card-check"><canvas data-sprite="check"></canvas></span></button>`,
    )
    .join('')
  paintIcons($('stage-cards'))
}
function selectStage(index) {
  stage = index
  const l = levels[index]
  $('hero-art').style.backgroundImage = `url("/art/${l.art}.webp")`
  $('art-caption').textContent = pad(index + 1) + '  /  ' + l.name.toUpperCase()
  $('current-index').textContent = pad(index + 1)
  document
    .querySelectorAll('[data-stage]')
    .forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.stage) === index)))
}
function showDialog(html) {
  if (!modal.open) {
    restoreFocus = document.activeElement
    modal.showModal()
  }
  body.innerHTML = html
  // Watching players must not land on End Game while still holding Jump.
  body.tabIndex = -1
  const target = body.querySelector('.primary') ?? body
  target.focus({ preventScroll: true })
}
function closeDialog() {
  if (modal.open) modal.close()
  restoreFocus?.focus?.({ preventScroll: true })
  restoreFocus = null
}
function button(action, text, primary = false) {
  return `<button class="${primary ? 'primary' : 'modal-button'}" data-action="${action}">${text}</button>`
}
function help() {
  if (loading) return
  helpReturn = mode
  if (mode === 'play') {
    pressed.clear()
    music(false)
  }
  mode = 'help'
  showDialog(
    `<p class="modal-kicker">FIELD MANUAL</p><h2 class="modal-title">How to play</h2><p class="modal-text">Climb each ladder and reach the golden bell at the summit. Some barrels take the ladders. Jump over barrels for 100 points and grab gold coins for 50.</p><table class="control-table"><thead><tr><th>CONTROL</th><th>PLAYER 1</th><th>PLAYER 2</th></tr></thead><tbody><tr><td>Move</td><td><kbd>←</kbd> <kbd>→</kbd></td><td><kbd>A</kbd> <kbd>D</kbd></td></tr><tr><td>Climb</td><td><kbd>↑</kbd> <kbd>↓</kbd></td><td><kbd>W</kbd> <kbd>S</kbd></td></tr><tr><td>Jump</td><td><kbd>Space</kbd></td><td><kbd>F</kbd></td></tr><tr><td>Pause</td><td colspan="2"><kbd>Esc</kbd> or <kbd>P</kbd></td></tr></tbody></table><p class="modal-text">In local co-op, share a keyboard and a score. Each explorer gets three lives. Either player can ring the bell. On two computers, each player uses solo controls. Choose Climb Together to share the stage, or Take Turns to switch after a lost life or a stage clear.</p><div class="modal-actions">${button('close-help', 'GOT IT', true)}</div>`,
  )
}
function closeHelp() {
  if (helpReturn === 'pause') {
    mode = 'play'
    pause()
  } else if (helpReturn === 'play') {
    resume()
  } else {
    closeDialog()
    mode = 'lobby'
  }
}
function updateHUD() {
  if (lastScore !== run.score) {
    $('score').textContent = pad(run.score, 6)
    lastScore = run.score
  }
  const lives = run.players.map((p) => p.lives).join(',')
  if (lastLives !== lives) {
    lastLives = lives
    $('lives').innerHTML = run.players
      .map(
        (p) =>
          `<span class="player-life" aria-label="Player ${p.id + 1}, ${p.lives} lives"><b>P${p.id + 1}</b><span class="hearts">${p.lives ? '♥'.repeat(p.lives) : 'OUT'}</span></span>`,
      )
      .join('')
  }
}
function message(text, duration = 2300) {
  clearTimeout(noticeTimer)
  $('scene-message').textContent = text
  if (text)
    noticeTimer = setTimeout(() => {
      $('scene-message').textContent = ''
    }, duration)
}
async function start(index = stage, carry = {}) {
  if (loading) return
  const request = ++launchId
  loading = true
  mode = 'loading'
  $('menu-notice').textContent = ''
  closeDialog()
  initAudio()
  mute(!sound)
  $('start').disabled = true
  try {
    const { World } = await import('./world.js')
    if (request !== launchId) return
    lobby.hidden = true
    game.hidden = false
    world ??= new World(viewport)
    run = new Run(index, count, carry)
    world.build(run)
    selectStage(index)
    $('hud-stage-number').textContent = 'STAGE ' + pad(index + 1) + ' / ' + pad(levels.length)
    $('hud-stage-name').textContent = run.level.name
    $('game-keys').textContent =
      count === 1
        ? '← →  MOVE  ·  ↑ ↓  CLIMB  ·  SPACE  JUMP'
        : 'P1  ARROWS + SPACE   ·   P2  WASD + F'
    $('objective').textContent = 'Reach the golden summit bell'
    lastScore = -1
    lastLives = ''
    updateHUD()
    mode = 'play'
    pressed.clear()
    accum = 0
    previousTime = 0
    sfx('start')
    music(true, index)
    viewport.focus({ preventScroll: true })
    window.scrollTo(0, 0)
    message(run.level.hint, 3300)
  } catch (err) {
    if (request !== launchId) return
    console.error('Unable to initialize the 3D playfield', err)
    lobby.hidden = false
    game.hidden = true
    mode = 'error'
    showDialog(
      `<p class="modal-kicker">PLAYFIELD UNAVAILABLE</p><h2 class="modal-title">3D graphics needed</h2><p class="modal-text">Enable hardware acceleration in your browser or open the game in a browser with WebGL 2 support.</p><div class="modal-actions">${button('lobby', 'BACK TO ARCADE', true)}</div>`,
    )
  } finally {
    if (request === launchId) {
      loading = false
      $('start').disabled = false
    }
  }
}
function pause() {
  if (cabinet) {
    if (cabinet.canControl && cabinet.state.phase === 'playing') {
      pressed.clear()
      cabinet.keys(0)
      cabinet.send('pause')
    }
    return
  }
  if (mode !== 'play') return
  mode = 'pause'
  pressed.clear()
  music(false)
  showDialog(
    `<p class="modal-kicker">STAGE ${pad(stage + 1)} · ${run.level.name.toUpperCase()}</p><h2 class="modal-title">Game paused</h2><div class="modal-actions">${button('resume', 'RESUME', true)}${button('help', 'CONTROLS')}${button('lobby', 'MAIN MENU')}</div>`,
  )
}
function resume() {
  closeDialog()
  mode = 'play'
  pressed.clear()
  previousTime = 0
  accum = 0
  music(true, stage)
  viewport.focus({ preventScroll: true })
}
function toLobby() {
  launchId++
  loading = false
  $('start').disabled = false
  $('menu-notice').textContent = ''
  commitBest()
  if (cabinet) {
    cabinet.close()
    cabinet = null
  }
  lanView = ''
  lanScreen = ''
  lanMusic = ''
  $('score-label').textContent = 'SCORE'
  $('turn-owner').hidden = true
  $('lan-leave').hidden = true
  $('pause').disabled = false
  $('touch-controls').hidden = false
  const url = new URL(location.href)
  url.searchParams.delete('lan')
  history.replaceState(null, '', url)
  closeDialog()
  mode = 'lobby'
  count = 1
  selectStage(0)
  lastLives = ''
  lastScore = -1
  previousTime = 0
  accum = 0
  music(false)
  pressed.clear()
  message('')
  world?.clear()
  game.hidden = true
  lobby.hidden = false
  run = null
  $('start').focus({ preventScroll: true })
  window.scrollTo(0, 0)
}
function result() {
  mode = run.state
  commitBest()
  music(false)
  pressed.clear()
  const success = mode === 'clear',
    last = stage === levels.length - 1
  const title = success ? (last ? 'Canopy conquered!' : 'Stage clear!') : 'Game over'
  const details = success
    ? `Summit bell reached in ${Math.floor(run.time)}s. Time bonus +${run.bonus}.`
    : 'The barrels won this round. Your next climb starts here.'
  showDialog(
    `<p class="modal-kicker">${run.level.name.toUpperCase()} · STAGE ${pad(stage + 1)}</p><h2 class="modal-title">${title}</h2><p class="modal-text">${details}</p><div class="result-score">${pad(run.score, 6)} <small style="font:12px var(--mono)">PTS</small></div><div class="modal-actions">${success && !last ? button('next', 'NEXT STAGE', true) : button(success ? 'again' : 'retry', success ? 'PLAY AGAIN' : 'TRY AGAIN', true)}${button('lobby', 'MAIN MENU')}</div>`,
  )
}
function inputs() {
  const has = (k) => pressed.has(k),
    solo = count === 1 || !!cabinet
  return [
    {
      left: has('ArrowLeft') || (solo && has('KeyA')),
      right: has('ArrowRight') || (solo && has('KeyD')),
      up: has('ArrowUp') || (solo && has('KeyW')),
      down: has('ArrowDown') || (solo && has('KeyS')),
      jump: has('Space') || (solo && has('KeyF')),
    },
    {
      left: has('KeyA'),
      right: has('KeyD'),
      up: has('KeyW'),
      down: has('KeyS'),
      jump: has('KeyF'),
    },
  ]
}
function frame(now) {
  requestAnimationFrame(frame)
  if (mode === 'lan') {
    if (cabinet?.state?.board && run && !game.hidden) {
      const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.1) : 0
      previousTime = now
      if (cabinet.state.phase === 'playing') {
        world.draw(dt)
        tickAudio()
      }
    }
    return
  }
  if (mode !== 'play' || !run) return
  const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.1) : 0
  previousTime = now
  accum += dt
  const state = inputs()
  while (accum >= STEP) {
    run.step(STEP, state)
    accum -= STEP
  }
  tickAudio()
  world.draw(dt)
  updateHUD()
  for (const event of run.events) {
    sfx(event.kind)
    if (event.kind === 'hit') {
      const n = run.players[event.player].lives
      message(
        `P${event.player + 1} · ${n ? n + ' ' + (n === 1 ? 'life' : 'lives') + ' left' : 'out of lives'}`,
        1450,
      )
    }
    if (event.kind === 'vault') message('BARREL JUMP  +100', 850)
  }
  run.events.length = 0
  if (run.state !== 'playing') result()
}
$('stage-cards').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-stage]')
  if (btn) {
    initAudio()
    sfx('select')
    selectStage(Number(btn.dataset.stage))
  }
})
function startLocal(players) {
  if (loading || mode !== 'lobby') return
  count = players
  start()
}
$('start').addEventListener('click', () => startLocal(1))
$('shared-start').addEventListener('click', () => startLocal(2))
$('help').addEventListener('click', help)
$('pause').addEventListener('click', pause)
$('sound').addEventListener('click', () => {
  initAudio()
  sound = !sound
  save('sound', sound ? 'on' : 'off')
  updateSound()
  if (sound) sfx('select')
})
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    $('fullscreen').title = 'Fullscreen is unavailable in this browser'
  }
})
if (!document.fullscreenEnabled) $('fullscreen').hidden = true
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'
  $('fullscreen').setAttribute('aria-label', label)
  $('fullscreen').title = label
  world?.resize()
})
body.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action
  if (!action) return
  const actions = {
    'lan-play': () => {
      initAudio()
      cabinet?.send('play')
    },
    'copy-invite': copyInvite,
    reload: () => location.reload(),
    resume,
    help,
    'close-help': closeHelp,
    lobby: toLobby,
    retry: () => start(stage),
    again: () => start(0),
    next: () => start(stage + 1, { score: run.score, lives: run.players.map((p) => p.lives) }),
  }
  actions[action]?.()
})
modal.addEventListener('cancel', (e) => {
  e.preventDefault()
  if (mode === 'help') closeHelp()
  else if (mode === 'pause') resume()
  else if (mode === 'error') toLobby()
})
const gameKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'KeyF',
])
window.addEventListener('keydown', (e) => {
  // A held key from the previous turn or dialog needs a new press to act again.
  if (e.repeat && !pressed.has(e.code) && (gameKeys.has(e.code) || e.code === 'Enter')) {
    e.preventDefault()
    return
  }
  if (mode === 'pause' && e.code === 'KeyP' && !e.repeat) {
    e.preventDefault()
    resume()
    return
  }
  if (mode === 'lan') {
    if (e.metaKey || e.ctrlKey || e.altKey || !cabinet?.canControl) return
    if ((e.code === 'KeyP' || e.code === 'Escape') && cabinet.state.phase === 'paused') {
      e.preventDefault()
      if (!e.repeat) cabinet.send('play')
      return
    }
    if (
      (e.code === 'KeyP' || e.code === 'Escape') &&
      !modal.open &&
      cabinet.state.phase === 'playing'
    ) {
      e.preventDefault()
      if (!e.repeat) pause()
      return
    }
    if (cabinet.state.phase === 'playing' && gameKeys.has(e.code)) {
      e.preventDefault()
      pressed.add(e.code)
      sendKeys()
    }
    return
  }
  if (mode !== 'play') return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault()
    if (!e.repeat) pause()
    return
  }
  if (gameKeys.has(e.code)) {
    e.preventDefault()
    pressed.add(e.code)
  }
})
window.addEventListener('keyup', (e) => {
  pressed.delete(e.code)
  sendKeys()
})
function releaseControls() {
  pressed.clear()
  pause()
}
window.addEventListener('blur', releaseControls)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseControls()
})
for (const btn of $('touch-controls').querySelectorAll('button')) {
  const key = btn.dataset.key
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    btn.setPointerCapture(e.pointerId)
    pressed.add(key)
    sendKeys()
  })
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    btn.addEventListener(ev, () => {
      pressed.delete(key)
      sendKeys()
    })
}
paintIcons()
renderCards()
updateSound()
$('best').textContent = pad(best, 6)
const icon = document.createElement('link')
icon.rel = 'icon'
icon.href = document.querySelector('.brand canvas').toDataURL()
document.head.append(icon)
requestAnimationFrame(frame)

$('total-stages').textContent = pad(levels.length)
$('lan-start').addEventListener('click', () => joinLan('turns'))
$('lan-coop').addEventListener('click', () => joinLan('coop'))
$('lan-leave').addEventListener('click', toLobby)
const linkedMode = new URLSearchParams(location.search).get('lan')
if (linkedMode === 'coop' || linkedMode === '1')
  joinLan(linkedMode === 'coop' ? 'coop' : 'turns', false)

function sendKeys() {
  if (!cabinet) return
  const k = inputs()[0]
  cabinet.keys(
    (k.left ? 1 : 0) | (k.right ? 2 : 0) | (k.up ? 4 : 0) | (k.down ? 8 : 0) | (k.jump ? 16 : 0),
  )
}
async function joinLan(networkMode, fresh = true) {
  if (cabinet || loading || mode !== 'lobby') return
  initAudio()
  mode = 'lan'
  $('menu-notice').textContent = ''
  pressed.clear()
  const session = new Cabinet(
    stage,
    networkMode,
    (state) => {
      if (cabinet === session) receiveLan(state)
    },
    (status) => {
      if (cabinet === session) lanStatus(status)
    },
    fresh,
  )
  cabinet = session
  const url = new URL(location.href)
  url.searchParams.set('lan', networkMode === 'coop' ? 'coop' : '1')
  history.replaceState(null, '', url)
  lanStatus('connecting')
  try {
    const { World } = await import('./world.js')
    if (cabinet !== session) return
    world ??= new World(viewport)
    session.open()
  } catch {
    if (cabinet === session) lanStatus('graphics')
  }
}
function lanStatus(status) {
  if (status === 'updated') {
    music(false)
    showDialog(
      `<p class="modal-kicker">LAN ARCADE</p><h2 class="modal-title">Game updated</h2><p class="modal-text">Reload this page to use the latest game, then choose a mode.</p><div class="modal-actions">${button('reload', 'RELOAD GAME', true)}${button('lobby', 'MAIN MENU')}</div>`,
    )
    return
  }
  if (status === 'partner-left' || status === 'expired') {
    toLobby()
    $('menu-notice').textContent =
      status === 'partner-left'
        ? 'Your partner ended the game. Choose a mode to play again.'
        : 'The previous game ended. Choose a mode for a fresh game.'
    return
  }
  lanScreen = ''
  lanMusic = ''
  music(false)
  pressed.clear()
  const detail = {
    connecting: ['Joining the cabinet', 'Connecting to the local arcade host.'],
    disconnected: [
      'Reconnecting…',
      'The game computer is unreachable. Keep this tab open to reconnect to the paused game.',
    ],
    full: ['Cabinet occupied', 'Both seats are taken. Join again when a player leaves.'],
    replaced: ['Seat reopened', 'This seat is now connected in another tab.'],
    graphics: ['3D graphics needed', 'Open the game in a browser with WebGL 2 support.'],
  }[status]
  showDialog(
    `<p class="modal-kicker">LAN ARCADE</p><h2 class="modal-title">${detail[0]}</h2><p class="modal-text">${detail[1]}</p><div class="modal-actions">${button('lobby', 'BACK TO ARCADE')}</div>`,
  )
}
function receiveLan(state) {
  const own = cabinet.seat,
    active = state.active,
    coop = cabinet.mode === 'coop',
    mine = cabinet.canControl,
    board = state.board
  if (board) {
    const key = state.match + '-' + cabinet.mode + '-' + state.stage + '-' + active
    const rebuild = key !== lanView
    if (rebuild) {
      run = new Run(state.stage, board.players.length)
      if (!coop) run.seat = active
    }
    Object.assign(run, {
      state: board.outcome,
      time: board.time,
      score: board.score,
      sinceThrow: board.sinceThrow,
      players: board.players,
      hazards: board.hazards,
      barrels: board.barrels,
    })
    run.coins.forEach((c, i) => {
      c.taken = !!(board.taken & (1 << i))
    })
    lobby.hidden = true
    game.hidden = false
    if (rebuild) {
      world.build(run)
      $('score-label').textContent = coop ? 'TEAM SCORE' : 'SCORE'
      lanView = key
      selectStage(state.stage)
    }
    $('hud-stage-number').textContent = 'STAGE ' + pad(state.stage + 1) + ' / ' + pad(levels.length)
    $('hud-stage-name').textContent = run.level.name
    $('score').textContent = pad(board.score, 6)
    const livesKey = state.seats.map((s) => s.lives).join(',')
    if (livesKey !== lastLives || rebuild) {
      lastLives = livesKey
      $('lives').innerHTML = state.seats
        .map(
          (s, i) =>
            `<span class="player-life" aria-label="Player ${i + 1}, ${s.lives} lives"><b>P${i + 1}</b><span class="hearts">${'♥'.repeat(s.lives) || 'OUT'}</span></span>`,
        )
        .join('')
    }
    $('turn-owner').hidden = false
    $('turn-owner').textContent = coop
      ? 'YOU ARE P' + (own + 1)
      : mine
        ? 'P' + (own + 1) + ' · YOUR TURN'
        : 'WATCHING P' + (active + 1)
    $('objective').textContent = coop
      ? state.seats[own].lives
        ? 'Climb together · Either player can ring the bell'
        : 'Out of lives · Watching P' + (2 - own)
      : mine
        ? 'Ring the summit bell'
        : 'Live view · P' + (active + 1) + ' is climbing'
    $('game-keys').textContent = mine
      ? 'ARROWS + SPACE  ·  OR WASD + F  ·  ESC PAUSE'
      : 'YOU ARE P' + (own + 1)
    $('pause').disabled = !mine
    $('lan-leave').hidden = false
    $('touch-controls').hidden = !mine
    if (state.phase !== 'playing') world.draw(0)
    commitBest()
  } else if (!game.hidden) {
    world.clear()
    run = null
    lanView = ''
    game.hidden = true
    lobby.hidden = false
  }
  const audioKey = state.phase === 'playing' ? String(state.stage) : ''
  if (audioKey !== lanMusic) {
    lanMusic = audioKey
    music(audioKey !== '', state.stage)
  }
  for (const kind of state.events) sfx(kind)
  const screen = [
    state.turn,
    state.phase,
    active,
    state.seats.map((s) => s.connected).join(','),
  ].join(':')
  if (screen === lanScreen) return
  lanScreen = screen
  pressed.clear()
  previousTime = 0
  if (state.phase === 'playing') {
    closeDialog()
    viewport.focus({ preventScroll: true })
    return
  }
  let title = '',
    text = '',
    controls = '',
    extra = ''
  if (state.phase === 'waiting') {
    title = 'Waiting for your partner'
    text =
      'Keep this tab open. On the other computer, open the link below or choose ' +
      (coop ? 'Climb Together' : 'Take Turns') +
      ' on the title screen.'
    extra =
      '<label class="link-label" for="invite-url">CABINET LINK</label><div class="invite-row"><input id="invite-url" readonly><button class="modal-button" data-action="copy-invite">COPY</button></div>'
  } else if (state.phase === 'offline') {
    title = 'Connection paused'
    text = 'Waiting for the other player to reconnect. Their seat is held for two minutes.'
  } else if (state.phase === 'finished') {
    const [a, b] = state.seats
    title = coop
      ? state.board.outcome === 'clear'
        ? 'Summit reached!'
        : 'Game over'
      : a.score === b.score
        ? 'A tie!'
        : 'Player ' + (a.score > b.score ? 1 : 2) + ' wins!'
    text = coop
      ? 'Team score · ' + pad(a.score, 6)
      : 'Final score · P1 ' + pad(a.score, 6) + '  /  P2 ' + pad(b.score, 6)
    controls = button('lobby', 'NEW GAME', true)
  } else if (coop) {
    const paused = state.phase === 'paused'
    title = paused
      ? 'Game paused'
      : state.notice === 'Stage clear!'
        ? 'Stage clear!'
        : 'Ready to climb together?'
    text = paused
      ? (state.notice ? state.notice + ' ' : '') + 'Either player can resume the climb.'
      : 'You are P' +
        (own + 1) +
        '. Use the arrow keys to move and climb, and Space to jump. You’ll see both climbers on both screens.'
    extra =
      '<div class="lan-scores"><span>' +
      levels[state.stage].name +
      ' · TEAM SCORE <b>' +
      pad(board.score, 6) +
      '</b></span></div>'
    controls = button(
      'lan-play',
      paused ? 'RESUME' : state.notice === 'Stage clear!' ? 'NEXT STAGE' : 'START CO-OP',
      true,
    )
  } else {
    const paused = state.phase === 'paused'
    title = paused ? 'Cabinet paused' : mine ? 'Your turn!' : 'Player ' + (active + 1) + ' is up'
    text =
      (state.notice ? state.notice + ' ' : '') +
      (mine
        ? paused
          ? 'Resume when you’re ready.'
          : 'Take the controls when you’re ready.'
        : 'You’ll see their climb live as soon as they start.')
    if (mine) controls = button('lan-play', paused ? 'RESUME' : 'START TURN', true)
    extra =
      '<div class="lan-scores">' +
      state.seats
        .map(
          (s, i) => `<span>P${i + 1} <b>${pad(s.score, 6)}</b> · STAGE ${pad(s.stage + 1)}</span>`,
        )
        .join('') +
      '</div>'
  }
  showDialog(
    `<p class="modal-kicker">${coop ? 'CLIMB TOGETHER' : 'TAKE TURNS'} · YOU ARE P${own + 1}</p><h2 class="modal-title">${title}</h2><p class="modal-text">${text}</p>${extra}<div class="modal-actions">${controls}${state.phase === 'finished' ? '' : button('lobby', 'END GAME')}</div>`,
  )
  if ($('invite-url')) $('invite-url').value = cabinet.invite
}
async function copyInvite() {
  const field = $('invite-url')
  if (!field) return
  const btn = body.querySelector('[data-action="copy-invite"]')
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(field.value)
    else {
      field.focus()
      field.select()
      if (!document.execCommand('copy')) throw Error()
    }
    btn.textContent = 'COPIED'
  } catch {
    field.focus()
    field.select()
    btn.textContent = 'SELECTED'
  }
}
