import { describe, expect, it } from "vitest";

import { groupClaimsByEntity } from "./claim-grouping";
import type { ExtractedClaim } from "./types";

const createClaim = (
  overrides: Partial<ExtractedClaim> = {},
): ExtractedClaim => ({
  claimId: "claim-1",
  rosterEntryId: "subject-id",
  claimText: "Alice works with Bob",
  subject: "Alice",
  predicate: "works with",
  object: "Bob",
  evidenceRefs: [],
  ...overrides,
});

describe("groupClaimsByEntity", () => {
  it("groups linked claims under each linked roster entry exactly once", () => {
    const claim = createClaim({
      linkedRosterEntryIds: ["subject-id", "object-id", "subject-id"],
    });

    const groupedClaims = groupClaimsByEntity([claim]);

    expect(groupedClaims.get("subject-id")).toEqual([claim]);
    expect(groupedClaims.get("object-id")).toEqual([claim]);
  });

  it("falls back to rosterEntryId for legacy claims", () => {
    const claim = createClaim();

    const groupedClaims = groupClaimsByEntity([claim]);

    expect(groupedClaims.get("subject-id")).toEqual([claim]);
    expect(groupedClaims.get("object-id")).toBeUndefined();
  });
});
