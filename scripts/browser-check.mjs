import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createArcadeHost } from '../server/host.js'
import { floorAt } from '../src/levels.js'

const host = createArcadeHost({ port: 0, hostname: '127.0.0.1' })
const url = await host.listen()
const browsers = [],
  errors = [],
  checks = []
const output = process.env.BARREL_BROWSER_ARTIFACTS || 'artifacts/browser'
await mkdir(output, { recursive: true })
async function player() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--enable-unsafe-swiftshader'],
  })
  browsers.push(browser)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  return page
}
async function until(predicate, label) {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((done) => setTimeout(done, 30))
  }
  throw Error('Timed out: ' + label)
}
const title = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor()
const action = (page, name) => page.locator('[data-action="' + name + '"]').click()
async function playing(page) {
  await page.locator('#modal').waitFor({ state: 'hidden' })
}
async function menu(page) {
  await page.locator('#lobby').waitFor({ state: 'visible' })
}
function checked(text) {
  checks.push(text)
  console.log('PASS ' + text)
}
function ring(run, index = 0) {
  const p = run.players[index],
    row = run.level.rows.length - 1,
    x = run.level.goalX
  Object.assign(p, {
    row,
    x,
    y: floorAt(run.level.rows[row], x),
    grounded: true,
    ladder: null,
    vx: 0,
  })
}
async function leaveLocal(page) {
  await page.locator('#pause').click()
  await title(page, 'Game paused')
  await action(page, 'lobby')
  await menu(page)
}
async function endLan(page, partner) {
  if (await page.locator('#modal').isVisible()) await action(page, 'lobby')
  else await page.locator('#lan-leave').click()
  await Promise.all([menu(page), menu(partner)])
}

try {
  const a = await player(),
    b = await player()
  await a.locator('[data-stage="2"]').click()
  await a.locator('#start').click()
  await a.locator('#game').waitFor({ state: 'visible' })
  assert.equal(await a.locator('.player-tag').count(), 1)
  assert.equal(await a.locator('#hud-stage-name').innerText(), 'Frostfall Peak')
  assert.equal(await a.locator('#score').innerText(), '000000')
  const initial = await a.locator('.player-tag').getAttribute('style')
  await a.keyboard.down('ArrowRight')
  await a.waitForTimeout(180)
  await a.keyboard.up('ArrowRight')
  await until(
    async () => (await a.locator('.player-tag').getAttribute('style')) !== initial,
    'solo movement',
  )
  await a.locator('#pause').click()
  await action(a, 'help')
  await title(a, 'How to play')
  await action(a, 'close-help')
  await title(a, 'Game paused')
  await action(a, 'lobby')
  await menu(a)
  await a.locator('#shared-start').click()
  await until(
    async () => (await a.locator('.player-tag').count()) === 2,
    'shared keyboard climbers',
  )
  await leaveLocal(a)
  await a.locator('#start').click()
  await until(async () => (await a.locator('.player-tag').count()) === 1, 'solo after local co-op')
  assert.equal(await a.locator('#lives').innerText(), 'P1\n♥♥♥')
  assert.equal(await a.locator('#score').innerText(), '000000')
  await leaveLocal(a)
  checked('Solo, local co-op, controls help, pause and new solo game reset correctly')

  await a.locator('[data-stage="3"]').click()
  await a.locator('#lan-coop').click()
  await title(a, 'Waiting for your partner')
  assert.match(await a.locator('#invite-url').inputValue(), /\?lan=coop$/)
  await b.goto(url + '/?lan=coop')
  await Promise.all([title(a, 'Ready to climb together?'), title(b, 'Ready to climb together?')])
  const coop = host.cabinets.coop
  const firstMatch = coop.table.match
  assert.equal(coop.table.stage, 3)
  assert.equal(await b.locator('#turn-owner').innerText(), 'YOU ARE P2')
  await action(b, 'lan-play')
  await Promise.all([playing(a), playing(b)])
  const [p1, p2] = coop.table.runs[0].players
  const x1 = p1.x,
    x2 = p2.x
  await a.keyboard.down('ArrowRight')
  await b.keyboard.down('KeyA')
  await until(() => p1.x > x1 + 0.1 && p2.x < x2 - 0.1, 'independent LAN controls')
  await a.keyboard.up('ArrowRight')
  await b.keyboard.up('KeyA')
  await a.keyboard.press('Escape')
  await Promise.all([title(a, 'Game paused'), title(b, 'Game paused')])
  await b.keyboard.press('KeyP')
  await Promise.all([playing(a), playing(b)])
  await a.screenshot({ path: output + '/coop.png' })
  await b.screenshot({ path: output + '/coop-player-2.png' })
  await a.evaluate(() => window.dispatchEvent(new Event('blur')))
  await Promise.all([title(a, 'Game paused'), title(b, 'Game paused')])
  await action(a, 'lan-play')
  await Promise.all([playing(a), playing(b)])
  coop.table.runs[0].score = 1250
  coop.table.runs[0].players[1].lives = 1
  await b.reload()
  await Promise.all([title(a, 'Game paused'), title(b, 'Game paused')])
  assert.equal(coop.table.match, firstMatch)
  assert.equal(await b.locator('#turn-owner').innerText(), 'YOU ARE P2')
  assert.equal(await b.locator('#score').innerText(), '001250')
  await endLan(b, a)
  assert.deepEqual(coop.seats, [null, null])
  checked(
    'Two independent browsers control co-op; either can pause/resume; reload preserves seat and run',
  )

  await a.locator('#lan-coop').click()
  await title(a, 'Waiting for your partner')
  await b.locator('#lan-coop').click()
  await title(a, 'Ready to climb together?')
  assert.notEqual(coop.table.match, firstMatch)
  assert.equal(coop.table.runs[0].score, 0)
  assert.ok(coop.table.runs[0].players.every((p) => p.lives === 3 && p.checkpoint === 0))
  await endLan(a, b)
  checked(
    'End Game releases both seats and the next co-op starts with fresh lives, score and checkpoints',
  )

  await a.locator('#lan-start').click()
  await title(a, 'Waiting for your partner')
  await b.locator('#lan-start').click()
  await Promise.all([title(a, 'Your turn!'), title(b, 'Player 1 is up')])
  const turns = host.cabinets.turns
  await action(a, 'lan-play')
  await Promise.all([playing(a), playing(b)])
  const r1 = turns.table.runs[0],
    spectatorX = r1.players[0].x
  await b.keyboard.press('ArrowRight')
  await a.waitForTimeout(60)
  assert.equal(r1.players[0].x, spectatorX)
  r1.score = 850
  await a.keyboard.down('Space')
  r1.players[0].protected = 0
  r1.hit(r1.players[0])
  await Promise.all([title(a, 'Player 2 is up'), title(b, 'Your turn!')])
  await a.keyboard.down('Space') // repeat from the previous turn must not activate End Game
  await a.keyboard.up('Space')
  assert.equal(turns.table.phase, 'ready')
  assert.ok(turns.online().every(Boolean))
  assert.notEqual(await a.evaluate(() => document.activeElement?.dataset.action), 'lobby')
  const frozen = JSON.stringify(r1)
  await action(b, 'lan-play')
  await Promise.all([playing(a), playing(b)])
  await b.keyboard.down('KeyD')
  await until(() => turns.table.runs[1].time > 0.12, 'second player turn')
  await b.keyboard.up('KeyD')
  assert.equal(JSON.stringify(r1), frozen)
  ring(turns.table.runs[1])
  await title(a, 'Your turn!')
  assert.equal(turns.table.runs[0].level.index, 0)
  assert.equal(turns.table.runs[1].level.index, 1)
  await a.screenshot({ path: output + '/turn-handoff.png' })
  await action(a, 'lan-play')
  await playing(a)
  r1.players[0].lives = 1
  r1.players[0].protected = 0
  r1.hit(r1.players[0])
  await title(b, 'Your turn!')
  await action(b, 'lan-play')
  await playing(b)
  const r2 = turns.table.runs[1]
  r2.players[0].lives = 1
  r2.players[0].protected = 0
  r2.hit(r2.players[0])
  await until(
    async () => (await a.locator('.modal-title').innerText()).includes('wins!'),
    'turn results',
  )
  assert.deepEqual(turns.seats, [null, null])
  await Promise.all([action(a, 'lobby'), action(b, 'lobby')])
  checked(
    'Turn handoffs isolate controls and progress; held Jump cannot end a match; results release seats',
  )

  await a.locator('[data-stage="5"]').click()
  await a.locator('#lan-coop').click()
  await title(a, 'Waiting for your partner')
  await b.locator('#lan-coop').click()
  await title(b, 'Ready to climb together?')
  await action(a, 'lan-play')
  await Promise.all([playing(a), playing(b)])
  ring(coop.table.runs[0], 1)
  await Promise.all([title(a, 'Summit reached!'), title(b, 'Summit reached!')])
  assert.deepEqual(coop.seats, [null, null])
  await a.screenshot({ path: output + '/coop-finished.png' })
  await Promise.all([action(a, 'lobby'), action(b, 'lobby')])
  await a.locator('#start').click()
  await a.locator('#game').waitFor({ state: 'visible' })
  assert.equal(await a.locator('#hud-stage-name').innerText(), 'Jungle Ruins')
  assert.equal(await a.locator('.player-tag').count(), 1)
  assert.equal(await a.locator('#score').innerText(), '000000')
  assert.equal(await a.locator('#lives').innerText(), 'P1\n♥♥♥')
  checked(
    'Co-op victory frees both seats; returning to solo resets stage, players, lives and score',
  )
  assert.deepEqual(errors, [])
  checked('No browser JavaScript errors')
  await writeFile(output + '/results.json', JSON.stringify({ checks, errors }, null, 2))
} catch (error) {
  await writeFile(
    output + '/results.json',
    JSON.stringify({ checks, errors, failure: error.stack }, null, 2),
  )
  for (let i = 0; i < browsers.length; i++)
    await browsers[i]
      .contexts()[0]
      ?.pages()[0]
      ?.screenshot({ path: output + '/failure-' + i + '.png' })
      .catch(() => {})
  throw error
} finally {
  await Promise.all(browsers.map((browser) => browser.close()))
  await host.close()
}
