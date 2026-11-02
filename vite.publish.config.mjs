import { mergeConfig } from 'vite'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import base from './vite.config.js'

// Do not publish another session's uncommitted shader changes.
const frozen = new Map([
  'src/components/PatternRefraction/PatternRefraction.jsx',
  'src/components/PatternRefraction/PatternRefraction.css',
].map(file => [path.resolve(file), file]))
const colorPath = path.resolve('src/lib/color.js')
const approvedColorHash = '2c2c789100728bcd98170e0f76be987eb1b6f96541d733c6323bb79b71f310ff'

export default mergeConfig(base, {
  plugins: [{
    name: 'publish-confirmed-modules-only', enforce: 'pre',
    load(id) {
      const resolved = id.split('?')[0]
      if (resolved === colorPath) {
        const source = readFileSync(colorPath, 'utf8')
        if (createHash('sha256').update(source).digest('hex') !== approvedColorHash) throw new Error('Detection source changed; review it before publishing')
        return source
      }
      const file = frozen.get(resolved)
      if (file) return execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })
    },
  }],
})
