/** Builds a small stereo 16-bit PCM WAV (sine tone) with RIFF INFO title/artist tags — real audio for real playback tests. */
export function makeWav({ seconds = 6, freq = 1000, title = 'Test Tone', artist = 'Test Artist', amp = 0.5 } = {}): Buffer {
  const rate = 44100, ch = 2, n = Math.floor(seconds * rate)
  const data = Buffer.alloc(n * ch * 2)
  for (let i = 0; i < n; i++) { const v = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * 32767); data.writeInt16LE(v, i * 4); data.writeInt16LE(v, i * 4 + 2) }
  const str = (s: string) => { const b = Buffer.from(s + '\0', 'latin1'); return b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b }
  const chunk = (id: string, body: Buffer) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]) }
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(ch, 2); fmt.writeUInt32LE(rate, 4); fmt.writeUInt32LE(rate * ch * 2, 8); fmt.writeUInt16LE(ch * 2, 12); fmt.writeUInt16LE(16, 14)
  const info = Buffer.concat([Buffer.from('INFO', 'latin1'), chunk('INAM', str(title)), chunk('IART', str(artist))])
  const body = Buffer.concat([Buffer.from('WAVE', 'latin1'), chunk('fmt ', fmt), chunk('LIST', info), chunk('data', data)])
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(body.length, 0); return b })(), body])
}
