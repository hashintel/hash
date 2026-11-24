import { describe, expect, it } from "vitest";

import { formatUuid } from "../../tokens/uuid";
import { generateUuidFromRng } from "./generate-uuid-from-rng";

describe("generateUuidFromRng", () => {
  it("is deterministic for the same rng state and advances the state", () => {
    const [first, stateAfterFirst] = generateUuidFromRng(42);
    const [again] = generateUuidFromRng(42);
    expect(again).toBe(first);
    expect(stateAfterFirst).not.toBe(42);

    const [second] = generateUuidFromRng(stateAfterFirst);
    expect(second).not.toBe(first);
  });

  it("forces the v4 version nibble and RFC 4122 variant bits", () => {
    let state = 7;
    for (let draw = 0; draw < 16; draw++) {
      const [uuid, nextState] = generateUuidFromRng(state);
      state = nextState;
      // eslint-disable-next-line no-bitwise -- bit inspection
      expect((uuid >> 76n) & 0xfn).toBe(4n);
      // eslint-disable-next-line no-bitwise -- bit inspection
      expect((uuid >> 62n) & 0x3n).toBe(2n);
      expect(uuid).toBeGreaterThanOrEqual(0n);
      expect(uuid).toBeLessThan(2n ** 128n);
      // The canonical string form matches the v4 shape.
      expect(formatUuid(uuid)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});
