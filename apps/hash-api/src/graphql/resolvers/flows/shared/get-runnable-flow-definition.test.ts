import { describe, expect, it, vi } from "vitest";

import { getRunnableFlowDefinition } from "./get-runnable-flow-definition";

const mocks = vi.hoisted(() => ({
  getFlowDefinitionEntityById: vi.fn(),
}));

vi.mock(
  "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id",
  () => ({ getFlowDefinitionEntityById: mocks.getFlowDefinitionEntityById }),
);

const halfBuiltFlowEntity = (archived = false) => ({
  metadata: { archived },
  properties: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
      "Half-built flow",
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
      "",
    "https://hash.ai/@h/types/property-type/input-definition/": [],
    "https://hash.ai/@h/types/property-type/step-definition/": [
      {
        kind: "action",
        stepId: "step-1",
        actionDefinitionId: "notAnAction",
        description: "",
        inputs: {},
      },
    ],
    "https://hash.ai/@h/types/property-type/output-definition/": [],
  },
});

const getHalfBuiltFlow = () =>
  getRunnableFlowDefinition(
    { dataSources: { graphApi: {} } } as never,
    "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002" as never,
  );

describe("getRunnableFlowDefinition", () => {
  it("refuses a flow that isn't valid as a bad request listing its problems", async () => {
    mocks.getFlowDefinitionEntityById.mockResolvedValue(halfBuiltFlowEntity());

    await expect(getHalfBuiltFlow()).rejects.toMatchObject({
      message: expect.stringContaining(
        'steps.0.actionDefinitionId: There is no action "notAnAction"',
      ),
      extensions: { code: "BAD_REQUEST" },
    });
  });

  it("refuses a flow that has been archived", async () => {
    mocks.getFlowDefinitionEntityById.mockResolvedValue(
      halfBuiltFlowEntity(true),
    );

    await expect(getHalfBuiltFlow()).rejects.toMatchObject({
      message: "This flow has been archived, so it can't be run",
      extensions: { code: "BAD_REQUEST" },
    });
  });
});
