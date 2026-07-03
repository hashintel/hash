import { fmix32 } from "../../../math/hash";

import type { EntityIndex } from "../../../ids";

/**
 * Order-independent fingerprint of an entity-index set: count plus the sum
 * and xor of each element's avalanche hash ({@link fmix32}, so structured
 * sets like `{0..n}` do not cancel). Two member sets of the same size
 * differing in even one entity produce different fingerprints, up to hash
 * collision odds of ~2^-64 given both aggregates must match.
 *
 * Used to detect equal-count membership changes that a plain length check
 * would miss (e.g. a cluster re-subdivision that swaps members).
 */
export function membershipFingerprint(
  entityIdxs: readonly EntityIndex[],
): string {
  /* eslint-disable no-bitwise -- integer hash aggregation */
  let sum = 0;
  let xor = 0;
  for (const entityIdx of entityIdxs) {
    const word = fmix32(entityIdx | 0);
    sum = (sum + word) | 0;
    xor ^= word;
  }
  /* eslint-enable no-bitwise */
  return `${entityIdxs.length}:${sum}:${xor}`;
}
