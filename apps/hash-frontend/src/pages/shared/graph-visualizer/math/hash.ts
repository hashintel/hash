/* eslint-disable no-bitwise, id-length, no-param-reassign */

function add32(a: number, b: number): number {
  return (a + b) >>> 0;
}

function mul32(a: number, b: number): number {
  return Math.imul(a, b) >>> 0;
}

function rotl32(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function getBlock32(key: Uint8Array, i: number): number {
  const offset = i * 4;

  return (
    (key[offset]! |
      (key[offset + 1]! << 8) |
      (key[offset + 2]! << 16) |
      (key[offset + 3]! << 24)) >>>
    0
  );
}

/**
 * MurmurHash3's 32-bit finalizer: a full-avalanche mix, so consecutive or
 * otherwise structured inputs map to well-spread words. Use it whenever
 * integer keys need decorrelating before they are combined (sums, xors,
 * bucket indices).
 */
export function fmix32(k: number): number {
  k ^= k >>> 16;
  k = mul32(k, 0x85ebca6b);
  k ^= k >>> 13;
  k = mul32(k, 0xc2b2ae35);
  k ^= k >>> 16;
  return k;
}

/**
 * MurmurHash3 x86 32-bit.
 *
 * Vendored and adapted from https://github.com/timepp/murmurhash/tree/master
 */
export function murmur3(key: Uint8Array, seed: number = 0): number {
  let h1 = seed >>> 0;

  const length = key.length;
  const blocks = Math.floor(length / 4);

  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  // body
  for (let i = 0; i < blocks; i++) {
    let k1 = getBlock32(key, i);
    k1 = mul32(k1, c1);
    k1 = rotl32(k1, 15);
    k1 = mul32(k1, c2);
    h1 ^= k1;
    h1 = rotl32(h1, 13);
    h1 = add32(mul32(h1, 5), 0xe6546b64);
  }

  const tail = key.slice(blocks * 4);

  let k1 = 0;

  if (tail.length >= 3) {
    k1 ^= tail[2]! << 16;
  }
  if (tail.length >= 2) {
    k1 ^= tail[1]! << 8;
  }
  if (tail.length >= 1) {
    k1 ^= tail[0]! << 0;
    k1 = mul32(k1, c1);
    k1 = rotl32(k1, 15);
    k1 = mul32(k1, c2);
    h1 ^= k1;
  }

  // finalization
  h1 ^= length;
  h1 = fmix32(h1);

  return h1;
}

export function murmur3String(key: string, seed: number = 0): number {
  return murmur3(new TextEncoder().encode(key), seed);
}

/**
 * Map a string to the unit interval [0, 1) via MurmurHash3.
 *
 * Deterministic: the same string always produces the same value,
 * regardless of call order or session.
 */
export function murmur3StringUnit(value: string): number {
  return murmur3String(value) / 0x100000000;
}
