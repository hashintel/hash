import { createHash } from "node:crypto";

import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { validateDeclaredBasis } from "../src/declared-basis";
import { joinedRootArcInputSchema } from "../src/tools/petrinaut-construction";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const markdown =
  "# Prepared mechanical tracer\n\nReserve the shared resource.\n";
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
  rationale: "Test-authored mechanics, not elicited testimony.",
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
  test("exports canonical root structure with only the basis envelope added, without claiming provider fidelity", () => {
    const generated = toJsonSchema(joinedRootArcInputSchema, {
      errorMode: "ignore",
    });
    const { brunch: _brunch, ...properties } = generated.properties ?? {};
    const { $schema: _generatedDialect, ...withoutDialect } = generated;
    const { $schema: _canonicalDialect, ...canonical } =
      petrinautAiTools.addArc.inputSchema.toJSONSchema();
    expect({
      ...withoutDialect,
      properties,
      required: generated.required?.filter((name) => name !== "brunch"),
    }).toEqual(canonical);
  });
  test("normalizes before the structural root-addArc carrier and retains only the declared envelope beside canonical arguments", () => {
    const input = {
      transitionId: "transition",
      arcDirection: "input",
      placeId: "place",
      weight: "1",
      type: "standard",
      brunch: { basis, requestedBaseHash: "a".repeat(64) },
    };
    expect(v.parse(joinedRootArcInputSchema, input)).toEqual({
      ...input,
      weight: 1,
    });
    for (const invalid of [
      { ...input, extra: true },
      { ...input, weight: 0 },
      { ...input, targetSubnetId: "subnet" },
      { ...input, placeId: { id: "place" } },
    ]) {
      expect(v.safeParse(joinedRootArcInputSchema, invalid).success).toBe(
        false,
      );
    }
  });
});
