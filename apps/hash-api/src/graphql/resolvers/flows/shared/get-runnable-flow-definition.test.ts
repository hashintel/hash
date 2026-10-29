import { describe, expect, it, vi } from "vitest";

import { getRunnableFlowDefinition } from "./get-runnable-flow-definition";

const mocks = vi.hoisted(() => ({
  getFlowDefinitionEntityById: vi.fn(),
}));

vi.mock(
  "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id",
  () => ({ getFlowDefinitionEntityById: mocks.getFlowDefinitionEntityById }),
);

const flowDefinitionEntityWithSteps = (steps: unknown[]) => ({
  properties: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
      "Half-built flow",
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
      "",
    "https://hash.ai/@h/types/property-type/input-definition/": [],
    "https://hash.ai/@h/types/property-type/step-definition/": steps,
    "https://hash.ai/@h/types/property-type/output-definition/": [],
  },
});

const graphQLContext = {
  authentication: { actorId: "00000000-0000-0000-0000-000000000001" },
  dataSources: { graphApi: {} },
  user: { enabledFeatureFlags: [] },
};

const flowDefinitionEntityId =
  "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002";

describe("getRunnableFlowDefinition", () => {
  it("refuses a flow that isn't valid as a bad request listing its problems", async () => {
    mocks.getFlowDefinitionEntityById.mockResolvedValue(
      flowDefinitionEntityWithSteps([
        {
          kind: "action",
          stepId: "step-1",
          actionDefinitionId: "notAnAction",
          description: "",
          inputs: {},
        },
      ]),
    );

    await expect(
      getRunnableFlowDefinition(
        graphQLContext as never,
        flowDefinitionEntityId as never,
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(
        /can't run until its problems are fixed[\s\S]*steps\.0\.actionDefinitionId/,
      ),
      extensions: { code: "BAD_REQUEST" },
    });
  });

  it("returns a valid flow's definition", async () => {
    mocks.getFlowDefinitionEntityById.mockResolvedValue(
      flowDefinitionEntityWithSteps([]),
    );

    await expect(
      getRunnableFlowDefinition(
        graphQLContext as never,
        flowDefinitionEntityId as never,
      ),
    ).resolves.toMatchObject({
      flowDefinition: { name: "Half-built flow" },
      flowType: "integration",
    });
  });
});
