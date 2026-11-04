import { GifWriter } from 'omggif'

export function bottomGif({ disposal = 1, restore = false, tooMany = false, huge = false } = {}) {
  const width = huge ? 2000 : 1071, height = huge ? 2000 : 180
  const buffer = new Uint8Array(500000)
  const writer = new GifWriter(buffer, width, height, { loop: 0, palette: [0x621fb7, 0x22dddd, 0xff2200, 0xffffff] })
  if (huge) writer.addFrame(0, 0, 1, 1, new Uint8Array([1]))
  else if (tooMany) for (let i = 0; i < 301; i++) writer.addFrame(0, 0, 1, 1, new Uint8Array([i % 2]), { delay: 1 })
  else {
    const first = new Uint8Array(width * height)
    for (let y = 40; y < 140; y++) for (let x = 820; x < 900; x++) first[y * width + x] = 1
    writer.addFrame(0, 0, width, height, first, { delay: 20, disposal: 1 })
    if (restore) {
      writer.addFrame(800, 20, 20, 20, new Uint8Array(400).fill(2), { disposal, delay: 20 })
      writer.addFrame(1000, 10, 1, 1, new Uint8Array([3]), { delay: 20 })
    } else {
      const last = new Uint8Array(width * height)
      for (let y = 40; y < 140; y++) for (let x = 960; x < 1040; x++) last[y * width + x] = 1
      writer.addFrame(0, 0, width, height, last, { delay: 20, disposal: 1 })
    }
  }
  return Buffer.from(buffer.slice(0, writer.end()))
}

export function transparentDisposalGif() {
  const buffer = new Uint8Array(10000)
  const writer = new GifWriter(buffer, 50, 50, { palette: [0xff0000, 0x00ff00], background: 1 })
  writer.addFrame(0, 0, 50, 50, new Uint8Array(2500), { disposal: 1 })
  writer.addFrame(10, 10, 20, 20, new Uint8Array(400).fill(1), { disposal: 2, transparent: 0 })
  writer.addFrame(40, 40, 1, 1, new Uint8Array([1]), { disposal: 1 })
  return Buffer.from(buffer.slice(0, writer.end()))
}

export function partialFirstGif() {
  const buffer = new Uint8Array(10000)
  const writer = new GifWriter(buffer, 50, 50, { palette: [0xff0000, 0x00ff00], background: 1 })
  writer.addFrame(10, 10, 20, 20, new Uint8Array(400), { disposal: 1 })
  return Buffer.from(buffer.slice(0, writer.end()))
}
