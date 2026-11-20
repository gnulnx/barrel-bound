import { defineConfig } from 'vite'

// The development and static preview pages can join the same running LAN cabinet.
const proxy = { '/arcade': { target: 'http://127.0.0.1:4175', ws: true } }
export default defineConfig({ server: { proxy }, preview: { proxy } })
