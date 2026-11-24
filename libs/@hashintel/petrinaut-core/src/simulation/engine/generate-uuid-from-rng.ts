import { nextRandom } from "./seeded-rng";

/**
 * Generates a v4-shaped UUID from the seeded simulation RNG (never
 * `crypto.randomUUID` — simulation runs must stay deterministic per seed).
 *
 * Draws eight values from `nextRandom`, takes the top 16 bits of each,
 * assembles them MSB-first into a 128-bit bigint, then forces the version (4)
 * and RFC 4122 variant bits.
 */
export function generateUuidFromRng(
  rngState: number,
): [uuid: bigint, nextRngState: number] {
  let state = rngState;
  let b = 0n;
  // The seeded LCG's low bits are unreliable: `LCG_A * state` exceeds 2^53
  // for large states, so each draw's low ~8 bits are float-precision
  // artifacts (visibly zero in generated IDs). Only the top 16 bits of each
  // draw are well-mixed and precision-safe, so a UUID takes eight 16-bit
  // draws instead of four 32-bit ones.
  for (let draw = 0; draw < 8; draw++) {
    const [value, nextState] = nextRandom(state);
    state = nextState;
    const word = Math.floor(value * 0x1_0000);
    // eslint-disable-next-line no-bitwise -- assembling the 128-bit value
    b = (b << 16n) | BigInt(word);
  }
  /* eslint-disable no-bitwise -- version/variant bit surgery */
  // Version nibble (bits 76–79) := 4.
  b = (b & ~(0xfn << 76n)) | (0x4n << 76n);
  // Variant bits (bits 62–63) := 0b10 (RFC 4122).
  b = (b & ~(0x3n << 62n)) | (0x2n << 62n);
  /* eslint-enable no-bitwise */
  return [b, state];
}
