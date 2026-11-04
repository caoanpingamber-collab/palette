import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

test('compressed OCR engines preserve the exact existing binaries with smaller transfers', () => {
  for (const name of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
    const source = new URL(`../public/ocr/${name}.wasm.js`, import.meta.url)
    const original = readFileSync(source), compressed = readFileSync(new URL(`${source.href}.gz`))
    assert.deepEqual(gunzipSync(compressed), original)
    assert.ok(compressed.length < original.length * .4)
  }
})
