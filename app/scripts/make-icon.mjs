// Generates resources/icon.png: a simple teal rounded square with a white "stack of boxes" glyph.
// Own artwork, dependency-free PNG writer.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const S = 256
const px = Buffer.alloc(S * S * 4)
const inRound = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r - 1)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r - 1)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let c = [0, 0, 0, 0]
    if (inRound(x, y, 8, 8, 248, 248, 48)) {
      const t = y / S
      c = [Math.round(14 + 20 * t), Math.round(116 + 30 * t), Math.round(144 - 10 * t), 255]
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 3; col++)
          if (inRound(x, y, 52 + col * 54, 108 + row * 54, 98 + col * 54, 154 + row * 54, 8))
            c = [255, 255, 255, 255]
      if (inRound(x, y, 106, 54, 152, 100, 8)) c = [255, 255, 255, 255]
    }
    px.set(c, (y * S + x) * 4)
  }
}
const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (b) => {
  let c = 0xffffffff
  for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const cr = Buffer.alloc(4)
  cr.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, cr])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])
mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.png', png)
console.log('icon.png', png.length, 'bytes')
