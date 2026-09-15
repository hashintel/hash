import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import { validateDeclaredBasis } from "../src/declared-basis";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const markdown = "# Settled account\n\nReserve the shared resource.\n";
const current: WorkpieceRevision = {
  revisionId: "settled-call",
  sha256: createHash("sha256").update(markdown).digest("hex"),
  markdown,
  ordinal: 2,
};
const older = { ...current, revisionId: "older-call", ordinal: 1 };
const basis = {
  kind: "declared" as const,
  revisionId: current.revisionId,
  sha256: current.sha256,
  locators: [{ start: markdown.indexOf("Reserve"), end: markdown.length - 1 }],
  rationale: "Settled testimony about the reservation.",
  scope: "operation" as const,
};

describe("settled root arc basis", () => {
  test("accepts a basis citing the settled revision", async () => {
    await expect(
      validateDeclaredBasis(basis, current, async () => undefined),
    ).resolves.toEqual(basis);
  });
  test("refuses a citation of an unknown revisionId", async () => {
    await expect(
      validateDeclaredBasis(
        { ...basis, revisionId: "unknown" },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/unknown/iu);
  });
  test("refuses a superseded revision unless supersession is intended", async () => {
    const citation = { ...basis, revisionId: older.revisionId };
    await expect(
      validateDeclaredBasis(citation, current, async () => older),
    ).rejects.toThrow(/superseded/iu);
    await expect(
      validateDeclaredBasis(
        { ...citation, supersessionIntended: true },
        current,
        async () => older,
      ),
    ).resolves.toMatchObject({ supersessionIntended: true });
    await expect(
      validateDeclaredBasis(
        { ...citation, revisionId: "unknown", supersessionIntended: true },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/unknown/iu);
  });
  test("refuses missing current state even with retained history and supersession intent", async () => {
    await expect(
      validateDeclaredBasis(
        { ...basis, supersessionIntended: true },
        null,
        async () => current,
      ),
    ).rejects.toThrow(/current.*unknown/iu);
  });
  test("refuses wrong hashes and out-of-revision locators", async () => {
    await expect(
      validateDeclaredBasis(
        { ...basis, sha256: "0".repeat(64) },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/hash/iu);
    await expect(
      validateDeclaredBasis(
        { ...basis, locators: [{ start: 0, end: 999 }] },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/locator/iu);
  });
});
