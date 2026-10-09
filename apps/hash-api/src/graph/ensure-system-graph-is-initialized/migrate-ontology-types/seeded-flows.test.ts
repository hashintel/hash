import { describe, expect, it } from "vitest";

import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { getLatestFlowDefinitionSnapshots } from "./flow-definition-snapshots";
import { seededFlows, toSnapshotForm } from "./seeded-flows";

const latestSnapshots = await getLatestFlowDefinitionSnapshots();

describe("seeded flows", () => {
  for (const { flow } of seededFlows) {
    const { flowDefinitionId, flowDefinition } = flow;

    describe(flowDefinition.name, () => {
      it("matches its latest snapshot, so migrations seed what the code defines", () => {
        expect(
          latestSnapshots.get(flowDefinitionId)?.flowDefinition,
          `The flow has changed since it was last seeded. Run \`yarn workspace @apps/hash-api generate-flow-definition-migration\` to write a migration that updates its entity.`,
        ).toEqual(toSnapshotForm(flowDefinition));
      });
    });
  }

  for (const [
    flowDefinitionId,
    { migrationNumber, flowDefinition },
  ] of latestSnapshots) {
    it(`snapshot of ${flowDefinitionId} in migration ${migrationNumber} is valid against the current actions`, () => {
      expect(
        validateFlowDefinition(flowDefinition).diagnostics.filter(
          ({ severity }) => severity === "error",
        ),
      ).toEqual([]);
    });
  }
});
