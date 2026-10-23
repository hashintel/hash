import { describe, expect, it } from "vitest";

import * as browserPluginFlows from "@local/hash-isomorphic-utils/flows/definitions/browser-plugin-flow-definitions";
import * as fileFlows from "@local/hash-isomorphic-utils/flows/definitions/file-flow-definitions";
import * as frontendFlows from "@local/hash-isomorphic-utils/flows/definitions/frontend-flow-definitions";
import * as ftseInvestorsFlows from "@local/hash-isomorphic-utils/flows/definitions/ftse-investors-flow-definition";
import * as goalFlows from "@local/hash-isomorphic-utils/flows/definitions/goal-flow-definitions";
import * as integrationFlows from "@local/hash-isomorphic-utils/flows/definitions/integration-flow-definitions";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { devFlows } from "./dev-flows";
import { getLatestFlowDefinitionSnapshots } from "./flow-definition-snapshots";
import { seededFlows, toSnapshotForm } from "./seeded-flows";

import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";

const latestSnapshots = await getLatestFlowDefinitionSnapshots();

const isFlow = (value: unknown): value is FlowDefinitionWithId =>
  typeof value === "object" &&
  value !== null &&
  "flowDefinitionId" in value &&
  "flowDefinition" in value;

/** Flows defined in code that aren't seeded anywhere: FTSE investors is a test fixture for `forEach` steps. */
const unseededFlows = [ftseInvestorsFlows.ftseInvestorsFlow];

describe("seeded flows", () => {
  it("seeds every flow defined in code, through migrations or in development", () => {
    const flowsInCode = Object.values({
      ...browserPluginFlows,
      ...fileFlows,
      ...frontendFlows,
      ...ftseInvestorsFlows,
      ...goalFlows,
      ...integrationFlows,
    }).filter(isFlow);

    const listedFlowIds = new Set(
      [...seededFlows, ...devFlows, ...unseededFlows].map(
        ({ flowDefinitionId }) => flowDefinitionId,
      ),
    );

    expect(
      flowsInCode
        .filter(({ flowDefinitionId }) => !listedFlowIds.has(flowDefinitionId))
        .map(({ flowDefinition }) => flowDefinition.name),
      "Add each of these flows to `seededFlows` if HASH provides it, or to `devFlows` if it only exists in development.",
    ).toEqual([]);
  });

  for (const { flowDefinitionId, flowDefinition } of seededFlows) {
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
