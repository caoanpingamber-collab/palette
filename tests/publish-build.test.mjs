import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'vite'

test('Miaoda publish keeps lazy modules in one entry after the platform CDN redirect', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'banner-publish-build-'))
  try {
    const result = await build({ configFile: 'vite.publish.config.mjs', envDir: directory, publicDir: false, logLevel: 'silent', build: { outDir: path.join(directory, 'site') } })
    const chunks = result.output.filter(item => item.type === 'chunk')
    assert.equal(chunks.length, 1, 'Relative lazy imports resolve on the redirected CDN and can return403')
    assert.deepEqual(chunks[0].dynamicImports.filter(file => file !== chunks[0].fileName), [])
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
