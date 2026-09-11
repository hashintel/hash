import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  reconcileDefinitionObservations,
  type ArcMutationAttempt,
  type DefinitionObservation,
} from "../src/mutation-record";

const load = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/reconciliation/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const result = load("record") as {
  metadata: { mutationRecord: { attempts: ArcMutationAttempt[] } };
};
const recorded = result.metadata.mutationRecord.attempts[0]?.post;
if (!recorded) throw new Error("Actual recorded full observation missing.");
const observed = load("observation") as DefinitionObservation;
const rehash = (
  definition: DefinitionObservation["definition"],
): DefinitionObservation => ({
  definition,
  sha256: createHash("sha256").update(JSON.stringify(definition)).digest("hex"),
});

test("recognizes only full-definition object-key-order equivalence while retaining distinct verified raw hashes", async () => {
  expect(recorded.sha256).not.toBe(observed.sha256);
  expect(await reconcileDefinitionObservations(recorded, observed)).toEqual({
    status: "serialization-equivalent",
    recordedSha256: recorded.sha256,
    observedSha256: observed.sha256,
  });
});

test("refuses value, type, presence and array-order differences rather than normalizing them", async () => {
  const changed = structuredClone(observed.definition);
  const transition = changed.transitions[0];
  if (!transition) throw new Error("Fixture transition absent.");
  transition.name += " changed";
  const presence = { ...observed.definition, componentInstances: [] };
  const reordered = {
    ...observed.definition,
    transitions: [...observed.definition.transitions].reverse(),
  };
  await Promise.all(
    [changed, presence, reordered].map(async (definition) => {
      expect(
        (await reconcileDefinitionObservations(recorded, rehash(definition)))
          .status,
      ).toBe("different");
    }),
  );
  const wrongType = structuredClone(observed.definition);
  Object.assign(wrongType.transitions[0] ?? {}, { name: 17 });
  await expect(
    reconcileDefinitionObservations(recorded, rehash(wrongType)),
  ).rejects.toThrow(/canonical observation/iu);
});

test("refuses invalid raw hashes and missing full observations", async () => {
  await expect(
    reconcileDefinitionObservations(recorded, {
      ...observed,
      sha256: "a".repeat(64),
    }),
  ).rejects.toThrow(/hash/iu);
  await expect(
    reconcileDefinitionObservations(
      { ...recorded, sha256: "b".repeat(64) },
      observed,
    ),
  ).rejects.toThrow(/hash/iu);
  await expect(
    reconcileDefinitionObservations(recorded, {
      sha256: observed.sha256,
    } as DefinitionObservation),
  ).rejects.toThrow(/full observations/iu);
});
