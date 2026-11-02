import { spawn } from 'node:child_process'
import path from 'node:path'
import { configuration, root } from '../server/config.mjs'

const config = configuration()
const env = { ...process.env, HISTORY_API_TARGET: `http://127.0.0.1:${config.port}` }
const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' }),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill('SIGTERM')
}
for (const child of children) {
  child.once('error', error => { console.error(error.message); stop(1) })
  child.once('exit', code => stop(code || 0))
}
process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())
