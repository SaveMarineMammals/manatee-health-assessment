/**
 * UUIDv7 — time-ordered, so ids sort by creation and an index over them stays
 * dense as breaths are appended. The server upserts by id, which also makes a
 * duplicated send harmless when sync arrives in P4.
 *
 * The random source is injected rather than reached for globally: React Native
 * has no `crypto.getRandomValues` without a polyfill, and injecting keeps this
 * module pure and the tests deterministic.
 */
export type RandomBytes = (length: number) => Uint8Array;

export function uuidv7(randomBytes: RandomBytes, nowMs: number): string {
  const bytes = new Uint8Array(16);

  // 48-bit big-endian millisecond timestamp.
  const ms = Math.max(0, Math.floor(nowMs));
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes.set(randomBytes(10), 6);

  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
