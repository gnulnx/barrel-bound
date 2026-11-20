// Each cell is one pixel. Drawing at native resolution keeps the cabinet icons crisp.
const sprites = {
  ape: [
    '.....oooooo.....',
    '...oooooooooo...',
    '..ooaaaaooaaao..',
    '.ooooaaaaoaaaoo.',
    '.ooooottttttooo.',
    'oaoottottott ooao'.replaceAll(' ', 'o'),
    'oaoowwottowwoaoo',
    'oaootkotttktoaoo',
    '.oooattttttaooo.',
    '..oottoooott oo..'.replaceAll(' ', 'o'),
    '..oattttttttao..',
    '...attkkkktta...',
    '...atwwttwwta...',
    '....atttttta....',
    '.....aaaaaa.....',
    '................',
  ],
  trophy: [
    '..yyyyyyyyyy..',
    '.yyayyyyyyayy.',
    'yy.ayyyyyya.yy',
    'yy.ayyyayya.yy',
    '.yyyayyyayyyy.',
    '...yaayyaay...',
    '....aaaaaa....',
    '......yy......',
    '......ya......',
    '....yyyyyy....',
    '...aaaaaaaa...',
  ],
  sound: [
    '.......ww......',
    '......www...w..',
    '.....wwww....w.',
    '.wwwwwwww.w..w.',
    '.wwwwwwww..w..w',
    '.wwwwwwww..w..w',
    '.wwwwwwww..w..w',
    '.wwwwwwww.w..w.',
    '.....wwww....w.',
    '......www...w..',
    '.......ww......',
  ],
  mute: [
    '.......ww......',
    '......www......',
    '.....wwww......',
    '.wwwwwwww.w...w',
    '.wwwwwwww..w.w.',
    '.wwwwwwww...w..',
    '.wwwwwwww..w.w.',
    '.wwwwwwww.w...w',
    '.....wwww......',
    '......www......',
    '.......ww......',
  ],
  expand: [
    'wwwww.....wwwww',
    'wwwww.....wwwww',
    'ww...........ww',
    'ww...........ww',
    'ww...........ww',
    '...............',
    '...............',
    '...............',
    'ww...........ww',
    'ww...........ww',
    'ww...........ww',
    'wwwww.....wwwww',
    'wwwww.....wwwww',
  ],
  person: [
    '....wwww....',
    '...wwwwww...',
    '...wwwwww...',
    '...wwwwww...',
    '....wwww....',
    '............',
    '..wwwwwwww..',
    '.wwwwwwwwww.',
    '.wwwwwwwwww.',
    '.www....www.',
  ],
  tiles: [
    'ooooo..ooooo',
    'ooooo..ooooo',
    'ooooo..ooooo',
    'ooooo..ooooo',
    '............',
    'ooooo..ooooo',
    'ooooo..ooooo',
    'ooooo..ooooo',
    'ooooo..ooooo',
  ],
  check: ['.......kk', '......kk.', 'k....kk..', 'kk..kk...', '.kkkk....', '..kk.....'],
  keyboard: [
    '.wwwwwwwwwwwwwww.',
    'ww.............ww',
    'ww.w.w.w.w.w.w.ww',
    'ww.............ww',
    'ww.w.w.w.w.w.w.ww',
    'ww.............ww',
    'ww...wwwwwww...ww',
    '.wwwwwwwwwwwwwww.',
  ],
  pause: [
    'www...www',
    'www...www',
    'www...www',
    'www...www',
    'www...www',
    'www...www',
    'www...www',
    'www...www',
    'www...www',
  ],
}
const palette = { w: '#eeeadd', o: '#db7a2e', a: '#a95725', t: '#ffb852', k: '#27291e', y: '#f7bd55' }
export function paintIcon(canvas, name = canvas.dataset.sprite) {
  const rows = sprites[name]
  if (!rows) return
  canvas.width = Math.max(...rows.map((row) => row.length))
  canvas.height = rows.length
  const ctx = canvas.getContext('2d')
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (palette[c]) {
        ctx.fillStyle = palette[c]
        ctx.fillRect(x, y, 1, 1)
      }
    }),
  )
}
export function paintIcons(el = document) {
  el.querySelectorAll('canvas[data-sprite]').forEach((c) => paintIcon(c))
}
