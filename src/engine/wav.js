// 16-bit PCM WAV encoder for rendered loops. Returns bytes ready to write to a file.
export function encodeWav(left, right, rate) {
  const channels = right ? 2 : 1, length = left.length;
  const bytes = length * channels * 2, data = new ArrayBuffer(44 + bytes), view = new DataView(data);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes, true);
  const sources = right ? [left, right] : [left];
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.min(1, Math.max(-1, sources[c][i] || 0));
      view.setInt16(offset, Math.round(v < 0 ? v * 32768 : v * 32767), true); offset += 2;
    }
  }
  return new Uint8Array(data);
}
