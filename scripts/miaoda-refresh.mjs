import { spawn } from 'node:child_process'
import { mkdirSync, chmodSync } from 'node:fs'
import path from 'node:path'
import { configuration, root } from '../server/config.mjs'

const config = configuration()
if (config.storage !== 'miaoda' || !/^app_[a-z0-9]+$/.test(config.miaoda.appId)) throw new Error('Configure the approved Miaoda app first')
const dir = path.dirname(config.miaoda.envFile)
mkdirSync(dir, { recursive: true, mode: 0o700 })
const relative = path.relative(root, dir)
if (relative.startsWith('..')) throw new Error('Refresh requires the private .history-data directory')
const child = spawn('lark-cli', ['apps', '+env-pull', '--app-id', config.miaoda.appId, '--project-path', relative, '--as', 'user', '--json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.resume(); child.stderr.resume()
child.once('error', () => { console.error('Credential refresh failed; check lark-cli authorization'); process.exitCode = 1 })
child.once('close', code => {
  if (code !== 0) { console.error('Credential refresh failed; cloud archival has no local fallback'); process.exitCode = 1; return }
  chmodSync(config.miaoda.envFile, 0o600)
  console.log('Private development credentials refreshed. No credentials were sent to the frontend.')
})
