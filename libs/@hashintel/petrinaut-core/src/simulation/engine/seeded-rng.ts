/* eslint-disable no-bitwise -- 32-bit integer arithmetic throughout */
/**
 * Counter-based random streams: Philox-2x32-10 (Salmon, Moraes, Dror and Shaw,
 * "Parallel Random Numbers: As Easy as 1, 2, 3", SC 2011; `philox2x32` in the
 * Random123 library).
 *
 * Each draw is the Philox bijection of the stream's counter under the stream's
 * key, so a stream's values depend only on its key and how many draws it has
 * made, and streams with different keys are independent.
 */

/**
 * A stream's position: its key, fixed for the stream, and its counter, which
 * every draw advances by one.
 */
export type RandomStream = { key: number; counter: number };

const PHILOX_M = 0xd256d193;
const PHILOX_M_LO = PHILOX_M & 0xffff;
const PHILOX_M_HI = PHILOX_M >>> 16;
const PHILOX_W = 0x9e3779b9 | 0;
const PHILOX_ROUNDS = 10;

/**
 * The two output words of the latest `philoxInto` call. A typed array rather
 * than variables, whose writes would box values above 2^31.
 */
const output = new Uint32Array(2);

/**
 * Philox-2x32-10 of the counter `(counter0, counter1)` under `key`, written to
 * `output` so draws allocate nothing. Words are held as int32 bit patterns.
 */
function philoxInto(counter0: number, counter1: number, key: number): void {
  let left = counter0 | 0;
  let right = counter1 | 0;
  let roundKey = key | 0;
  for (let round = 0; round < PHILOX_ROUNDS; round++) {
    // High 32 bits of the 64-bit product `PHILOX_M * left`, by schoolbook
    // multiplication of 16-bit halves: every partial sum stays below 2^32.
    const leftLo = left & 0xffff;
    const leftHi = left >>> 16;
    const lowCarry = PHILOX_M_HI * leftLo + ((PHILOX_M_LO * leftLo) >>> 16);
    const highCarry = PHILOX_M_LO * leftHi + (lowCarry & 0xffff);
    const high =
      (PHILOX_M_HI * leftHi + (lowCarry >>> 16) + (highCarry >>> 16)) | 0;
    const low = Math.imul(PHILOX_M, left);

    left = high ^ roundKey ^ right;
    right = low;
    roundKey = (roundKey + PHILOX_W) | 0;
  }
  output[0] = left;
  output[1] = right;
}

/** Philox-2x32-10 of the counter `(counter0, counter1)` under `key`. */
export function philox2x32(
  counter0: number,
  counter1: number,
  key: number,
): [number, number] {
  philoxInto(counter0, counter1, key);
  return [output[0]!, output[1]!];
}

function drawWords(stream: RandomStream): void {
  philoxInto(stream.counter, 0, stream.key);
  // eslint-disable-next-line no-param-reassign -- a draw advances the stream
  stream.counter = (stream.counter + 1) >>> 0;
}

/** The stream's next value, uniform in [0, 1) with 53 random bits. */
export function nextRandom(stream: RandomStream): number {
  drawWords(stream);
  return (output[0]! * 0x20_0000 + (output[1]! >>> 11)) / 2 ** 53;
}

/** The stream's next 64 random bits. */
export function nextRandomBits64(stream: RandomStream): bigint {
  drawWords(stream);
  return (BigInt(output[0]!) << 32n) | BigInt(output[1]!);
}

/**
 * Each transition's stream key, in `transitionIds` order, derived from the
 * run's seed and the transition's id. A transition draws only from its own
 * stream, so runs from one seed that differ in some decisions keep the same
 * random timing for transitions whose enablement they share.
 */
export function deriveTransitionStreamKeys(
  transitionIds: readonly string[],
  seed: number,
): Uint32Array {
  const keys = new Uint32Array(transitionIds.length);
  for (const [transitionIndex, id] of transitionIds.entries()) {
    // FNV-1a over the id from a seed-dependent basis, finalised as murmur3's fmix32.
    let hash = 0x811c9dc5 ^ seed;
    for (let index = 0; index < id.length; index++) {
      hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193);
    }
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    keys[transitionIndex] = (hash ^ (hash >>> 16)) >>> 0;
  }
  return keys;
}
