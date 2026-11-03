/**
 * Minimal PNG reader for the e2e probes.
 *
 * The probes need one thing screenshots can give them and the DOM cannot: the
 * colour that actually reached a pixel. Everything the theme declares can be
 * read back from getComputedStyle, but a declaration that paints the wrong
 * colour — a gradient resolved against the wrong box, a layer that never
 * painted — is only visible in the frame.
 *
 * Supports what Chromium's Page.captureScreenshot emits: 8-bit, non-interlaced,
 * colour type 2 (RGB) or 6 (RGBA). Anything else throws rather than guessing.
 */

import { inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CHANNELS = { 2: 3, 6: 4 }

/**
 * @param {Buffer} buffer PNG bytes
 * @returns {{ width: number, height: number, pixel: (x: number, y: number) => [number, number, number] }}
 */
export function readPng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')

  let width
  let height
  let bitDepth
  let colorType
  let interlace
  const chunks = []
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      chunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  if (bitDepth !== 8) throw new Error('unsupported PNG bit depth ' + bitDepth)
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported')
  const channels = CHANNELS[colorType]
  if (channels === undefined) throw new Error('unsupported PNG colour type ' + colorType)

  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  let cursor = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++]
    const line = raw.subarray(cursor, cursor + stride)
    cursor += stride
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    const previous = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride)
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0
      const above = previous === null ? 0 : previous[i]
      const upperLeft = previous === null || i < channels ? 0 : previous[i - channels]
      let value = line[i]
      if (filter === 1) value += left
      else if (filter === 2) value += above
      else if (filter === 3) value += (left + above) >> 1
      else if (filter === 4) {
        const estimate = left + above - upperLeft
        const toLeft = Math.abs(estimate - left)
        const toAbove = Math.abs(estimate - above)
        const toUpperLeft = Math.abs(estimate - upperLeft)
        value += toLeft <= toAbove && toLeft <= toUpperLeft ? left : toAbove <= toUpperLeft ? above : upperLeft
      }
      row[i] = value & 0xff
    }
  }

  const pixel = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) throw new Error('pixel out of bounds: ' + x + ',' + y)
    const index = y * stride + x * channels
    return [pixels[index], pixels[index + 1], pixels[index + 2]]
  }

  return { width, height, pixel }
}

/** Largest per-channel difference between two RGB triples. */
export const channelDelta = (left, right) => Math.max(...left.map((value, index) => Math.abs(value - right[index])))
