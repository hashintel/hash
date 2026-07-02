// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { EntityIndex } from "../../ids";
import { membershipFingerprint } from "./membership-fingerprint";

const indices = (...values: number[]): EntityIndex[] =>
  values.map((value) => EntityIndex(value));

describe("membershipFingerprint", () => {
  it("is order-independent", () => {
    expect(membershipFingerprint(indices(1, 2, 3))).toBe(
      membershipFingerprint(indices(3, 1, 2)),
    );
  });

  it("distinguishes equal-count sets differing in one member", () => {
    expect(membershipFingerprint(indices(0, 1, 2))).not.toBe(
      membershipFingerprint(indices(0, 1, 3)),
    );
  });

  it("distinguishes consecutive ranges shifted by one", () => {
    // The raw indices are highly structured; the avalanche step is what
    // keeps their sum/xor aggregates from colliding across shifts.
    const rangeA = indices(...Array.from({ length: 100 }, (_, idx) => idx));
    const rangeB = indices(...Array.from({ length: 100 }, (_, idx) => idx + 1));
    expect(membershipFingerprint(rangeA)).not.toBe(
      membershipFingerprint(rangeB),
    );
  });

  it("distinguishes sets of different sizes sharing a prefix", () => {
    expect(membershipFingerprint(indices(1, 2))).not.toBe(
      membershipFingerprint(indices(1, 2, 3)),
    );
  });

  it("fingerprints the empty set stably", () => {
    expect(membershipFingerprint([])).toBe(membershipFingerprint([]));
  });
});
