import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

for (const name of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
  const source = new URL(`../public/ocr/${name}.wasm.js`, import.meta.url)
  const bytes = readFileSync(source), compressed = gzipSync(bytes, { level: 9 })
  writeFileSync(new URL(`${source.href}.gz`), compressed)
  console.log(`${name}: ${bytes.length} -> ${compressed.length} bytes`)
}
