import * as THREE from 'three'
import { floorAt } from './levels.js'

const cube = new THREE.BoxGeometry(),
  cylinder = new THREE.CylinderGeometry(1, 1, 1, 12),
  coinShape = new THREE.CylinderGeometry(1, 1, 1, 8)
const surface = new THREE.MeshLambertMaterial({ color: 0xffffff })
const pose = new THREE.Object3D()
function batch(parent) {
  const shapes = new Map()
  function add(x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0, geo = cube) {
    pose.position.set(x, y, z)
    pose.scale.set(w, h, d)
    pose.rotation.set(rx, ry, rz)
    pose.updateMatrix()
    if (!shapes.has(geo)) shapes.set(geo, [])
    shapes.get(geo).push([pose.matrix.clone(), new THREE.Color(color)])
  }
  function finish() {
    for (const [geo, items] of shapes) {
      const mesh = new THREE.InstancedMesh(geo, surface, items.length)
      items.forEach(([m, c], i) => {
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, c)
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
    }
  }
  return { add, finish }
}
function group(parent) {
  const g = new THREE.Group()
  parent.add(g)
  return g
}
function shade(color, f) {
  return new THREE.Color(color).multiplyScalar(f)
}
function generator(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
function beam(add, x1, y1, x2, y2, z, width, depth, color) {
  const dx = x2 - x1,
    dy = y2 - y1
  add((x1 + x2) / 2, (y1 + y2) / 2, z, width, Math.hypot(dx, dy), depth, color, 0, 0, -Math.atan2(dx, dy))
}
function barrel(parent) {
  const g = group(parent),
    b = batch(g),
    a = b.add
  a(0, 0, 0, 0.4, 0.81, 0.4, 0xb56f32, Math.PI / 2, 0, 0, cylinder)
  for (let i = 0; i < 12; i++) {
    const ang = (i * Math.PI) / 6
    a(
      Math.sin(ang) * 0.386,
      Math.cos(ang) * 0.386,
      0,
      0.19,
      0.055,
      0.73,
      [0xa9642e, 0xc98b43, 0x995229, 0xc0803a][i % 4],
      0,
      0,
      -ang,
    )
  }
  for (const z of [-0.3, 0.3]) {
    a(0, 0, z, 0.425, 0.102, 0.425, 0x60655d, Math.PI / 2, 0, 0, cylinder)
    a(0, 0, z + 0.027, 0.429, 0.021, 0.429, 0x939182, Math.PI / 2, 0, 0, cylinder)
  }
  for (const z of [-0.413, 0.413]) {
    a(0, 0, z, 0.34, 0.018, 0.34, 0xc38b50, Math.PI / 2, 0, 0, cylinder)
    for (const x of [-0.15, 0.08]) a(x, 0, z * 1.025, 0.018, 0.5, 0.012, 0x8d5c32)
  }
  a(0.15, 0.1, 0.429, 0.065, 0.065, 0.017, 0x65533b)
  b.finish()
  return g
}
function explorer(parent, id) {
  const root = group(parent),
    body = group(root),
    b = batch(body),
    a = b.add
  const coat = id ? 0x497eaf : 0x287c74,
    scarf = id ? 0xffd66e : 0xe44f2d
  a(0, 0.56, 0, 0.4, 0.45, 0.29, coat)
  a(0, 0.38, 0.015, 0.41, 0.09, 0.3, 0x67402c)
  a(0.03, 0.39, 0.176, 0.09, 0.067, 0.027, 0xf2bc56)
  a(0, 0.795, 0.015, 0.3, 0.13, 0.27, scarf)
  a(0.115, 0.67, 0.169, 0.095, 0.21, 0.045, scarf, 0, 0, -0.13)
  a(-0.08, 0.6, -0.16, 0.3, 0.31, 0.15, 0x755131)
  a(-0.11, 0.63, 0.162, 0.053, 0.31, 0.035, 0xb78a4b)
  a(0, 0.97, 0, 0.36, 0.33, 0.31, 0xe4ad77)
  a(0, 1.04, -0.1, 0.38, 0.2, 0.15, 0x543521)
  a(0, 1.145, -0.015, 0.56, 0.076, 0.47, id ? 0x698897 : 0xca903e)
  a(0, 1.245, -0.035, 0.4, 0.16, 0.34, id ? 0x8badb6 : 0xe3b355)
  a(0, 1.18, -0.035, 0.41, 0.067, 0.35, 0x775035)
  for (const s of [-1, 1]) {
    a(s * 0.11, 1.01, 0.163, 0.05, 0.06, 0.02, 0x262821)
    a(s * 0.19, 0.957, 0.009, 0.065, 0.09, 0.083, 0xd99c68)
  }
  a(0, 0.947, 0.179, 0.074, 0.061, 0.074, 0xe9a66e)
  a(0.012, 0.875, 0.158, 0.11, 0.026, 0.021, 0x83523d)
  b.finish()
  const legs = [],
    arms = []
  for (const s of [-1, 1]) {
    const leg = group(body)
    leg.position.set(s * 0.105, 0.36, 0)
    const l = batch(leg)
    l.add(0, -0.12, 0, 0.17, 0.25, 0.21, 0x69523d)
    l.add(0, -0.3, 0.043, 0.188, 0.12, 0.3, 0x503a2d)
    l.finish()
    legs.push(leg)
    const arm = group(body)
    arm.position.set(s * 0.245, 0.725, 0)
    const m = batch(arm)
    m.add(0, -0.08, 0, 0.14, 0.19, 0.22, coat)
    m.add(0, -0.21, 0.02, 0.13, 0.12, 0.17, 0xdda571)
    m.add(0, -0.29, 0.032, 0.14, 0.088, 0.16, 0x704d31)
    m.finish()
    arms.push(arm)
  }
  return { root, body, legs, arms }
}
function gorilla(parent) {
  const root = group(parent),
    torso = group(root),
    b = batch(torso),
    a = b.add
  const dark = 0x513022,
    fur = 0x70412b,
    light = 0x895136,
    skin = 0xc18a55,
    shadow = 0x975d39
  a(0, 1.13, 0, 1.3, 1.3, 0.83, dark)
  a(0, 1.58, 0.02, 1.64, 0.85, 0.94, fur)
  a(0, 1.33, 0.47, 1.0, 0.68, 0.13, shadow)
  a(0, 1.63, 0.51, 0.89, 0.36, 0.13, skin)
  a(0, 1.04, 0.43, 0.7, 0.32, 0.16, 0xb37b4b)
  for (const s of [-1, 1]) {
    a(s * 0.55, 0.56, 0, 0.65, 0.69, 0.65, dark)
    a(s * 0.65, 0.22, 0.13, 0.54, 0.42, 0.6, fur)
    a(s * 0.69, 0.11, 0.36, 0.62, 0.22, 0.73, shadow)
    for (let j = 0; j < 3; j++) a(s * 0.69 + (j - 1) * 0.18, 0.11, 0.71, 0.14, 0.16, 0.11, skin)
    a(s * 0.71, 1.86, -0.03, 0.76, 0.6, 0.86, light)
    a(s * 0.51, 2.22, 0.11, 0.4, 0.54, 0.56, fur)
    a(s * 0.65, 2.3, 0.1, 0.28, 0.31, 0.17, shadow)
    a(s * 0.67, 2.3, 0.2, 0.15, 0.17, 0.025, skin)
  }
  a(0, 2.36, 0.06, 1.0, 0.85, 0.79, fur)
  a(0, 2.79, 0.02, 0.73, 0.15, 0.57, light)
  a(0.12, 2.91, -0.06, 0.31, 0.12, 0.28, fur)
  a(0, 2.29, 0.47, 0.82, 0.58, 0.16, skin)
  a(0, 2.09, 0.55, 0.86, 0.31, 0.2, shadow)
  for (const s of [-1, 1]) {
    a(s * 0.25, 2.43, 0.574, 0.285, 0.19, 0.064, 0xffefc7)
    a(s * 0.19, 2.425, 0.616, 0.09, 0.13, 0.04, 0x26251d)
    a(s * 0.264, 2.55, 0.597, 0.44, 0.145, 0.15, dark, 0, 0, s * 0.16)
    a(s * 0.5, 2.18, 0.37, 0.24, 0.3, 0.19, light)
  }
  a(0, 2.27, 0.652, 0.4, 0.21, 0.14, shadow)
  a(-0.1, 2.27, 0.733, 0.085, 0.058, 0.025, dark)
  a(0.1, 2.27, 0.733, 0.085, 0.058, 0.025, dark)
  a(0, 2.04, 0.689, 0.61, 0.115, 0.032, 0x502c24)
  a(-0.22, 2.065, 0.719, 0.1, 0.095, 0.033, 0xffe0ad)
  a(0.22, 2.065, 0.719, 0.1, 0.095, 0.033, 0xffe0ad)
  b.finish()
  const arms = []
  for (const s of [-1, 1]) {
    const arm = group(torso)
    arm.position.set(s * 0.89, 1.73, 0)
    const b = batch(arm)
    b.add(s * 0.09, 0.28, 0, 0.58, 0.75, 0.65, fur, 0, 0, -s * 0.19)
    b.add(s * 0.22, 0.83, 0.015, 0.5, 0.6, 0.58, light, 0, 0, s * 0.05)
    b.add(s * 0.16, 1.13, 0.1, 0.45, 0.36, 0.54, shadow)
    for (let j = 0; j < 3; j++) b.add(s * 0.16 + (j - 1) * 0.13, 1.22, 0.34, 0.11, 0.23, 0.17, skin)
    b.finish()
    arms.push(arm)
  }
  const held = barrel(torso)
  held.position.set(0, 3.66, 0.13)
  held.scale.set(1.84, 1.84, 2.68)
  held.rotation.y = Math.PI / 2
  return { root, torso, arms, held }
}
function scenery(level, scene) {
  const b = batch(scene),
    a = b.add,
    rand = generator(232 + level.index),
    { biome, stone, wood, cap, rows } = level
  // Set dressing lives on the back edge so the players' silhouettes stay legible.
  function fern(x, y, z, size) {
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7
      for (let j = 0; j < 4; j++) {
        const r = size * (0.08 + j * 0.11)
        a(
          x + Math.cos(angle) * r,
          y + size * (0.13 + 0.1 * j - 0.022 * j * j),
          z + Math.sin(angle) * r,
          size * (0.11 + 0.03 * (3 - j)),
          size * 0.09,
          size * 0.16,
          shade(0x79a33e, 0.78 + i * 0.07),
          0,
          -angle,
        )
      }
    }
  }
  function lantern(x, y, z) {
    a(x, y + 0.39, z, 0.09, 0.78, 0.1, wood)
    a(x, y + 0.81, z, 0.33, 0.085, 0.22, 0x63472f)
    a(x + 0.1, y + 0.61, z, 0.17, 0.25, 0.17, 0xffbc4e)
    a(x + 0.1, y + 0.46, z, 0.23, 0.07, 0.21, 0x544535)
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    for (let j = 0; j < 8; j++) {
      const x = row.left + 0.5 + rand() * (row.right - row.left - 1),
        y = floorAt(row, x)
      if (biome === 'forest') {
        fern(x, y, -0.62, 0.47 + rand() * 0.8)
        if (level.art === 'falls' && j % 3 === 0) lantern(x, y, -0.69)
        if (j % 3 === 0) {
          a(x, y + 0.17, -0.45, 0.045, 0.3, 0.04, 0x57712a)
          a(x, y + 0.32, -0.45, 0.11, 0.085, 0.105, j % 2 ? 0xf4af43 : 0xf37449)
        }
      } else if (biome === 'forge') {
        a(x, y + 0.13, -0.59, 0.31, 0.29, 0.29, shade(stone, 0.74 + rand() * 0.38), 0.12, rand(), 0.14)
        a(x + 0.06, y + 0.24, -0.45, 0.1, 0.12, 0.12, 0xed9950, 0.18, rand(), 0.28)
      } else {
        a(x, y + 0.13, -0.62, 0.16, 0.33, 0.21, level.art === 'grotto' ? 0xb58bf0 : 0x87cadd, 0, 0.2, -0.18)
        a(
          x + 0.14,
          y + 0.22,
          -0.62,
          0.15,
          0.44,
          0.2,
          level.art === 'grotto' ? 0xd0b4fd : 0xb6e0ea,
          0,
          0.28,
          0.26,
        )
      }
    }
    for (const x of [row.left + 0.48, row.right - 0.51]) {
      const y = floorAt(row, x)
      if (biome === 'forest') {
        a(x, y + 0.21, -0.44, 0.53, 0.41, 0.48, shade(stone, 0.87))
        a(x, y + 0.45, -0.44, 0.6, 0.09, 0.56, cap)
        a(x, y + 0.24, -0.18, 0.24, 0.06, 0.04, 0x4d6048)
      } else lantern(x, y, -0.54)
    }
  }
  const start = rows[0]
  for (let i = 0; i < 44; i++) {
    const x = start.left + rand() * (start.right - start.left),
      y = floorAt(start, x) - 1.35 - rand() * 1.15
    a(
      x,
      y,
      (rand() - 0.5) * 1.8,
      0.45 + rand() * 0.9,
      0.8 + rand() * 1.6,
      0.8 + rand() * 0.7,
      shade(stone, 0.61 + rand() * 0.33),
      0,
      rand() * 0.14,
    )
  }
  if (biome === 'forest') {
    for (let j = 0; j < 14; j++)
      fern(start.left + rand() * (start.right - start.left), -1.2, 0.68, 0.7 + rand() * 0.5)
  }
  b.finish()
}
function platforms(level, world) {
  const rand = generator(411 + level.index * 33),
    b = batch(world),
    a = b.add
  const { biome, rows, wood, stone, cap } = level
  rows.forEach((row, i) => {
    const n = Math.ceil((row.right - row.left) / 1.12),
      w = (row.right - row.left) / n
    for (let j = 0; j < n; j++) {
      const x = row.left + (j + 0.5) * w,
        y = floorAt(row, x),
        dz = 0.06 * rand()
      a(x, y - 0.26, -0.05, w - 0.018, 0.44, 1.55 + dz, shade(stone, 0.82 + rand() * 0.28), 0, 0, row.tilt)
      a(x, y - 0.047, -0.055, w + 0.005, 0.105, 1.66, shade(cap, 0.84 + rand() * 0.23), 0, 0, row.tilt)
      if (biome !== 'forge' && i > 0) {
        a(
          x + w * 0.04,
          y - 0.51,
          -0.07,
          w * (0.78 + rand() * 0.19),
          0.15 + rand() * 0.18,
          1.39,
          shade(stone, 0.64 + rand() * 0.23),
          0,
          0,
          row.tilt,
        )
      }
      if (i === 0) {
        a(x, y - 0.91, -0.1, w - 0.015, 0.82 + rand() * 0.36, 1.5, shade(stone, 0.62 + rand() * 0.24))
        a(x + w * 0.27, y - 1.5, -0.17, w * 0.85, 1.15, 1.28, shade(stone, 0.55 + rand() * 0.28))
      }
      if (biome === 'forest') {
        for (let k = 0; k < 3; k++) {
          const h = 0.045 + rand() * 0.21
          a(
            x + (rand() - 0.5) * w,
            y - h * 0.5 - 0.055,
            0.785 + dz,
            0.09 + rand() * 0.19,
            h,
            0.08,
            shade(cap, 0.7 + rand() * 0.25),
          )
        }
        if (rand() < 0.32) {
          const v = 0.35 + rand() * 0.7
          a(x, y - 0.19 - v * 0.45, 0.81, 0.054, v, 0.04, 0x42652f)
          a(x + 0.05, y - 0.22 - v * 0.45, 0.83, 0.13, 0.08, 0.06, 0x668944, 0, 0, 0.4)
        }
        if (j % 4 === 1) {
          const n = 6 + Math.floor(rand() * 5)
          for (let k = 0; k < n; k++) {
            const q = x + Math.sin(k * 0.63) * 0.07
            a(q, y - 0.12 - k * 0.115, 0.824, 0.064, 0.14, 0.055, 0x526c33)
            if (k % 2 === 0)
              a(
                q + (k % 4 ? 0.06 : -0.06),
                y - 0.14 - k * 0.115,
                0.86,
                0.12,
                0.075,
                0.052,
                0x759042,
                0,
                0,
                k % 4 ? 0.38 : -0.38,
              )
          }
        }
        if (j % 5 === 1) {
          a(x, y - 0.27, 0.74, 0.31, 0.16, 0.038, 0x87916e)
          a(x, y - 0.27, 0.768, 0.17, 0.06, 0.02, 0x576149)
        }
      } else if (biome === 'forge') {
        a(x, y - 0.15, 0.76, w * 0.87, 0.18, 0.13, shade(wood, 0.8 + rand() * 0.3), 0, 0, row.tilt)
        a(x + w * 0.33, y - 0.15, 0.84, 0.055, 0.055, 0.04, 0xcbb393)
        if (j % 3 === 0) a(x + 0.17, y - 0.31, 0.77, 0.17, 0.12, 0.1, 0xc28857, 0, 0, 0.35)
      } else if (j % 3 === 0) {
        a(x, y - 0.21, 0.77, 0.14, 0.34, 0.11, 0xa8d5e4)
        a(x, y - 0.405, 0.77, 0.07, 0.12, 0.07, 0xbbdfeb)
      }
    }
    // Masonry and cross-braced trestles sit behind the climbing lane.
    if (i > 0) {
      for (let j = 0; j < 4; j++) {
        const x = row.left + 1.2 + (j * (row.right - row.left - 2.4)) / 3,
          y = floorAt(row, x) - 0.45,
          low = floorAt(rows[i - 1], x) - 0.1
        if (biome === 'forge') {
          a(x, (y + low) / 2, -0.59, 0.24, y - low, 0.36, wood)
          beam(a, x, low + 0.2, x + 1.55, y, -0.63, 0.16, 0.23, shade(wood, 0.8))
          a(x, y - 0.06, -0.55, 0.6, 0.23, 0.49, 0x664d3b)
        } else {
          a(x, (y + low) / 2, -0.71, 0.5, y - low, 0.62, shade(stone, 0.7))
          a(x, y - 0.12, -0.69, 0.82, 0.25, 0.82, shade(stone, 0.88))
          a(x, low + 0.22, -0.72, 0.75, 0.33, 0.76, shade(stone, 0.8))
          for (let k = 1; k < 4; k++)
            a(x, low + ((y - low) * k) / 4, -0.39, 0.5, 0.026, 0.03, shade(stone, 0.47))
        }
      }
    }
  })
  level.routes.forEach((xs, i) =>
    xs.forEach((x) => {
      const low = floorAt(rows[i], x),
        top = floorAt(rows[i + 1], x),
        h = top - low
      for (const s of [-1, 1]) {
        a(x + s * 0.34, (low + top) / 2 + 0.06, 0.91, 0.091, h + 0.16, 0.115, 0xab773b)
        a(x + s * 0.34, (low + top) / 2 + 0.06, 0.977, 0.045, h + 0.16, 0.035, 0xddab62)
        for (const f of [0.16, 0.83]) a(x + s * 0.34, low + h * f, 0.984, 0.11, 0.13, 0.035, 0x726b53)
      }
      const n = Math.ceil(h / 0.38)
      for (let j = 0; j < n; j++)
        a(x, low + 0.18 + (j * (h - 0.22)) / n, 0.95, 0.68, 0.083, 0.11, j % 2 ? 0xc29050 : 0xe0a95e)
    }),
  )
  // The summit bell is both a landmark and the goal trigger.
  const gx = level.goalX,
    gy = floorAt(rows.at(-1), gx)
  a(gx, gy + 0.024, 0.41, 1.4, 0.08, 1.36, 0xc6a256)
  for (const s of [-1, 1]) a(gx + s * 0.48, gy + 0.9, -0.1, 0.12, 1.8, 0.15, wood)
  a(gx, gy + 1.82, -0.1, 1.24, 0.14, 0.21, wood)
  a(gx, gy + 1.63, 0.0, 0.06, 0.32, 0.08, 0x746140)
  a(gx, gy + 1.43, 0.02, 0.38, 0.3, 0.39, 0xeeae32)
  a(gx, gy + 1.28, 0.02, 0.55, 0.13, 0.48, 0xf7c85c)
  a(gx, gy + 1.17, 0.02, 0.1, 0.13, 0.11, 0xa97330)
  b.finish()
}
function makeCoins(parent, coins) {
  return coins.map((c) => {
    const g = group(parent),
      b = batch(g)
    b.add(0, 0, 0, 0.225, 0.1, 0.225, 0xffcc4e, Math.PI / 2, 0, 0, coinShape)
    for (const s of [-1, 1]) {
      b.add(0, 0, s * 0.052, 0.162, 0.018, 0.162, 0xe9a935, Math.PI / 2, 0, 0, coinShape)
      b.add(0, 0, s * 0.068, 0.042, 0.21, 0.018, 0xffdf89, 0, 0, -0.1)
    }
    b.finish()
    g.position.set(c.x, c.y, 0.32)
    return g
  })
}
function makeHazard(parent, h, level) {
  const g = group(parent),
    base = batch(g),
    ground = floorAt(level.rows[h.row], h.x)
  const mine = level.biome === 'forge'
  base.add(0, 0.04, 0, 1.0, 0.09, 1.1, mine ? 0x514742 : 0x8bbccf)
  if (mine) for (let i = 0; i < 5; i++) base.add(-0.36 + i * 0.18, 0.1, 0, 0.07, 0.06, 0.92, 0x927f67)
  base.finish()
  g.position.set(h.x, ground, 0.15)
  const effect = group(g),
    b = batch(effect)
  if (mine) {
    for (let i = 0; i < 5; i++)
      b.add(
        (i - 2) * 0.16,
        0.35 + Math.sin(i) * 0.12,
        0.02,
        0.14,
        0.78 + Math.sin(i) * 0.26,
        0.19,
        i % 2 ? 0xff8c31 : 0xffca49,
        0,
        0,
        0.08 * (i - 2),
      )
  } else {
    b.add(0, 0.1, 0, 0.32, 0.38, 0.27, 0xb3e9fa)
    b.add(0, -0.16, 0, 0.18, 0.22, 0.16, 0x94d8f3)
    b.add(0, -0.31, 0, 0.08, 0.1, 0.09, 0xd7f7ff)
  }
  b.finish()
  const warning = group(g),
    w = batch(warning)
  w.add(0, 0.12, 0, 0.84, 0.025, 0.81, mine ? 0xff6b28 : 0x76ddff)
  w.finish()
  return { effect, warning, ground }
}
function makeMotes(parent, level) {
  const rand = generator(82),
    positions = new Float32Array(120 * 3)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (rand() - 0.5) * 36
    positions[i + 1] = rand() * 19
    positions[i + 2] = -4 + rand() * 9
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    size: level.biome === 'ice' ? 0.065 : 0.045,
    color: level.biome === 'ice' ? 0xe7f6ff : level.glow,
    transparent: true,
    opacity: 0.8,
  })
  const mesh = new THREE.Points(geom, mat)
  parent.add(mesh)
  return mesh
}

export class World {
  constructor(viewport) {
    this.el = viewport
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    viewport.prepend(this.renderer.domElement)
    this.camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 145)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(viewport)
    this.target = new THREE.Vector3()
  }
  build(run) {
    this.clear()
    this.run = run
    const level = run.level,
      scene = new THREE.Scene()
    this.scene = scene
    this.el.style.backgroundImage =
      'linear-gradient(#10252122,#10252138), url(/art/' + level.backdrop + '.webp)'
    scene.fog = new THREE.Fog(level.fog, 38, 85)
    const hemi = new THREE.HemisphereLight(
      level.biome === 'forge' ? 0xffd2ae : 0xfff1cd,
      level.biome === 'ice' ? 0x6476a0 : 0x76836a,
      1.9,
    )
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(level.biome === 'ice' ? 0xffe9bf : 0xffdda2, 2.25)
    sun.position.set(-7, 19, 11)
    sun.target.position.set(0, 4, 0)
    sun.castShadow = true
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 13, bottom: -11, near: 1, far: 51 })
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.normalBias = 0.024
    sun.shadow.bias = -0.0002
    scene.add(sun, sun.target)
    this.sun = sun
    const rim = new THREE.DirectionalLight(0x98cfda, 1.1)
    rim.position.set(8, 13, -8)
    scene.add(rim)
    scenery(level, scene)
    platforms(level, scene)
    this.ape = gorilla(scene)
    this.ape.root.position.set(
      level.goalX * 0.77,
      floorAt(level.rows.at(-1), level.goalX * 0.77) - 0.05,
      -0.5,
    )
    this.ape.root.rotation.y = level.goalX < 0 ? 0.27 : -0.27
    this.ape.root.scale.setScalar(1.05)
    this.coins = makeCoins(scene, run.coins)
    this.hazards = run.hazards.map((h) => makeHazard(scene, h, level))
    this.climbers = run.players.map((p) => explorer(scene, run.seat ?? p.id))
    this.labels = run.players.map((p) => {
      const tag = document.createElement('span')
      tag.className = 'player-tag p' + (run.seat ?? p.id)
      tag.textContent = 'P' + ((run.seat ?? p.id) + 1)
      tag.setAttribute('aria-hidden', 'true')
      this.el.append(tag)
      return tag
    })
    this.projected = new THREE.Vector3()
    this.barrelMeshes = new Map()
    this.barrelPool = []
    this.motes = makeMotes(scene, level)
    this.resize()
    this.snapCamera = true
    this.draw(0)
  }
  resize() {
    const w = this.el.clientWidth,
      h = this.el.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.aspect = w / h
    if (this.scene) this.cameraSetup(1, true)
  }
  cameraSetup(dt, snap) {
    const { level, players } = this.run,
      ar = this.aspect || 1.7
    const fullHeight = level.rows.at(-1).y + 6.95,
      fullWidth = level.half * 2 + 2.6
    let height = Math.max(fullHeight, fullWidth / ar),
      cx = 0,
      cy = (level.rows.at(-1).y + 3.72) / 2
    if (ar < 1.04) {
      const active = players.filter((p) => p.lives > 0)
      if (active.length) {
        const xs = active.map((p) => p.x),
          ys = active.map((p) => p.y),
          spanX = Math.max(...xs) - Math.min(...xs),
          spanY = Math.max(...ys) - Math.min(...ys)
        height = Math.max(11, Math.min(fullWidth, 11.1 + spanX) / ar, spanY + 5)
        const halfWidth = (height * ar) / 2,
          limit = Math.max(0, fullWidth / 2 - halfWidth)
        cx = THREE.MathUtils.clamp((Math.min(...xs) + Math.max(...xs)) / 2, -limit, limit)
        cy = THREE.MathUtils.clamp(
          (Math.min(...ys) + Math.max(...ys)) / 2 + 2.1,
          Math.min(height * 0.35, 5),
          Math.max(5, fullHeight - height * 0.32),
        )
      }
    }
    const smooth = snap ? 1 : 1 - Math.exp(-dt * 7)
    this.target.lerp(new THREE.Vector3(cx, cy, -0.15), smooth)
    const cam = this.camera
    cam.top = height / 2
    cam.bottom = -height / 2
    cam.left = (-height * ar) / 2
    cam.right = (height * ar) / 2
    cam.updateProjectionMatrix()
    cam.position.copy(this.target).add(new THREE.Vector3(2.3, 5.8, 30))
    cam.lookAt(this.target)
    cam.updateMatrixWorld()
  }
  draw(dt) {
    const r = this.run,
      t = r.time
    this.cameraSetup(dt, this.snapCamera)
    this.snapCamera = false
    r.players.forEach((p, i) => {
      const m = this.climbers[i],
        climbing = p.ladder !== null,
        step = climbing ? Math.sin(p.climbing) : Math.sin(p.walk)
      m.root.visible =
        p.lives > 0 && (p.protected < 0.1 || p.protected > 2.0 || Math.floor(p.protected * 10) % 2 === 0)
      m.root.position.set(p.x, p.y, climbing ? 0.99 : 0.31 + i * 0.11)
      this.projected.set(p.x, p.y + 1.52, m.root.position.z).project(this.camera)
      const label = this.labels[i]
      label.hidden = !p.lives
      label.style.left = (this.projected.x + 1) * 50 + '%'
      label.style.top = (1 - this.projected.y) * 50 + '%'
      const rot = climbing ? Math.PI : p.facing * 0.95
      m.body.rotation.y = THREE.MathUtils.lerp(m.body.rotation.y, rot, Math.min(1, dt * 19))
      const moving = Math.abs(p.vx) > 0.05 || climbing
      m.body.position.y = p.grounded && moving ? Math.abs(step) * 0.045 : 0
      m.legs.forEach((leg, j) => {
        leg.rotation.x =
          (j ? 1 : -1) *
          (climbing ? 0.65 : !p.grounded ? 0.43 : moving ? 0.57 : 0) *
          (!p.grounded && !climbing ? 1 : step)
      })
      m.arms.forEach((arm, j) => {
        arm.rotation.x = climbing
          ? -2.1 + step * (j ? 0.55 : -0.55)
          : !p.grounded
            ? -1.8
            : (j ? -0.55 : 0.55) * (moving ? step : 0)
      })
    })
    const ape = this.ape,
      throwMotion = Math.max(0, 1 - r.sinceThrow / 0.5)
    ape.torso.position.y = Math.sin(t * 2.8) * 0.028 - throwMotion * 0.12
    ape.torso.rotation.x = Math.sin(throwMotion * Math.PI) * 0.14
    ape.arms.forEach((arm, i) => {
      arm.rotation.x = Math.sin(throwMotion * Math.PI) * 1.05 + Math.sin(t * 2 + i) * 0.035
    })
    ape.held.visible = r.sinceThrow > 0.95
    ape.held.position.y = 3.66 + Math.sin(t * 2.8) * 0.025
    r.coins.forEach((c, i) => {
      const m = this.coins[i]
      m.visible = !c.taken
      m.position.y = c.y + Math.sin(t * 3 + i) * 0.055
      m.rotation.y = t * 2 + i * 0.76
    })
    const active = new Set(r.barrels.map((b) => b.id))
    for (const [id, m] of this.barrelMeshes)
      if (!active.has(id)) {
        m.visible = false
        this.barrelPool.push(m)
        this.barrelMeshes.delete(id)
      }
    for (const b of r.barrels) {
      let m = this.barrelMeshes.get(b.id)
      if (!m) {
        m = this.barrelPool.pop() || barrel(this.scene)
        m.visible = true
        this.barrelMeshes.set(b.id, m)
      }
      m.position.set(b.x, b.y, b.descending ? 1.19 : 0.3)
      m.rotation.z = b.rotation
    }
    r.hazards.forEach((h, i) => {
      const m = this.hazards[i],
        isIce = r.level.biome === 'ice'
      m.warning.visible = h.active || (h.warn && Math.floor(t * 8) % 2 === 0)
      m.effect.visible = h.active || (isIce && h.warn)
      m.effect.position.y = isIce ? (h.active ? h.y - m.ground : 2.62) : 0
      if (!isIce) m.effect.scale.y = 1.1 + Math.sin(t * 22) * 0.28
    })
    this.motes.position.y = r.level.biome === 'ice' ? (-t * 0.32) % 3 : Math.sin(t * 0.4) * 0.5
    this.motes.position.x = Math.sin(t * 0.2) * 0.56
    this.renderer.render(this.scene, this.camera)
  }
  clear() {
    if (!this.scene) return
    this.scene.traverse((obj) => {
      if (obj.isInstancedMesh) obj.dispose()
    })
    this.labels?.forEach((label) => label.remove())
    this.sun.shadow.dispose()
    this.motes.geometry.dispose()
    this.motes.material.dispose()
    this.scene.clear()
    this.scene = null
    this.renderer.renderLists.dispose()
  }
}
