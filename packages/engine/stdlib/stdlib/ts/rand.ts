/** Pseudo-random number generation. */
// @ts-ignore
import { jStat } from "jstat";

/**
 * Generates a random number
 */
function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export const rng = {
  _random_fn: Math.random,
};

function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/**
 * Sets a seed for rng.random() and the jStat library
 * @param s string for seed
 */
export function setSeed(s: string) {
  const seed = xmur3(s);
  rng._random_fn = sfc32(seed(), seed(), seed(), seed());
  jStat.setRandom(rng._random_fn);
}

/**
 * Returns a random number between 0 and 1
 */
export function random() {
  return rng._random_fn();
}
