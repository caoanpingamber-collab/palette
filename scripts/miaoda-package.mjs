import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
if (!target || !path.isAbsolute(target)) throw new Error('Pass the approved backend checkout absolute path')
const destination = path.join(target, 'server', 'history')
mkdirSync(destination, { recursive: true })
for (const name of ['app', 'auth', 'upload', 'schema', 'errors', 'digest', 'cloud-store', 'miaoda-repository']) {
  copyFileSync(path.join(root, 'server', `${name}.mjs`), path.join(destination, `${name}.mjs`))
}
console.log('Packaged the canonical history server modules; no frontend, credentials or local data copied.')
