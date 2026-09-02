/**
 * Seeding a tile's initial run state on the host.
 *
 * A run's RNG seed comes from its **absolute** index, so chunking and tiling
 * must not renumber it: a tiled experiment draws the same per-run streams as
 * an untiled one.
 */

/**
 * Words of run state staged on the host per `writeBuffer` call, 4 MiB worth.
 *
 * Large enough that the per-call overhead is irrelevant next to the copy, small
 * enough to allocate on any device: a single `Uint32Array` of a whole tile's
 * state is ~2 GiB for a million 2 KB runs, which the browser refuses outright.
 */
const SEED_CHUNK_WORDS = 1024 * 1024;

/**
 * Derives a per-run RNG seed.
 *
 * One PCG advance after mixing decorrelates adjacent run indices, which plain
 * sequential seeding leaves visibly correlated in the first few draws.
 */
/* eslint-disable no-bitwise -- a 32-bit PRNG is bit manipulation by definition */
export function deriveGpuRunSeed(
  baseSeed: number,
  globalRunIndex: number,
): number {
  const mixed = (baseSeed ^ Math.imul(globalRunIndex, 2654435761)) >>> 0;
  return (Math.imul(mixed, 747796405) + 2891336453) >>> 0;
}
/* eslint-enable no-bitwise */

/** How many runs to stage per `writeBuffer`, at least one however large a run is. */
export function seedRunsPerChunk(
  stateWordsPerRun: number,
  runCount: number,
): number {
  return Math.max(
    1,
    Math.min(runCount, Math.floor(SEED_CHUNK_WORDS / stateWordsPerRun)),
  );
}

/**
 * Writes one chunk of initial run state into a reused staging array: counts
 * from the initial marking, the typed places' token words, a per-run RNG
 * seed, everything else zero.
 */
/* eslint-disable no-param-reassign -- filling the caller's reusable staging
   array is this function's purpose; returning a fresh one per chunk would
   reintroduce the allocation the chunking exists to avoid */
export function fillSeedChunk(
  staging: Uint32Array,
  {
    firstRun,
    runsInChunk,
    stateWordsPerRun,
    placeCountOffsets,
    placeTokenOffsets,
    rngOffset,
    placeCounts,
    placeTokenWords,
    seed,
  }: {
    firstRun: number;
    runsInChunk: number;
    stateWordsPerRun: number;
    placeCountOffsets: readonly number[];
    placeTokenOffsets?: readonly number[];
    rngOffset: number;
    placeCounts: readonly number[];
    placeTokenWords?: readonly Uint32Array[];
    seed: number;
  },
): void {
  // Every field below is written for every run at the same offsets; the clear
  // keeps a previous chunk's words out of the upload should one ever be
  // written conditionally.
  staging.fill(0, 0, runsInChunk * stateWordsPerRun);
  for (let run = 0; run < runsInChunk; run++) {
    const base = run * stateWordsPerRun;
    for (const [placeIndex, offset] of placeCountOffsets.entries()) {
      staging[base + offset] = placeCounts[placeIndex] ?? 0;
    }
    if (placeTokenWords !== undefined && placeTokenOffsets !== undefined) {
      for (const [placeIndex, words] of placeTokenWords.entries()) {
        const tokenBase = base + (placeTokenOffsets[placeIndex] ?? 0);
        for (let word = 0; word < words.length; word++) {
          staging[tokenBase + word] = words[word]!;
        }
      }
    }
    staging[base + rngOffset] = deriveGpuRunSeed(seed, firstRun + run);
  }
}
/* eslint-enable no-param-reassign */
