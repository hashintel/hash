import { describe, expect, it, vi } from "vitest";

import { getRunnableFlowDefinition } from "./get-runnable-flow-definition";

vi.mock(
  "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id",
  () => ({
    getFlowDefinitionEntityById: () => ({
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
    }),
  }),
);

describe("getRunnableFlowDefinition", () => {
  it("refuses a flow that isn't valid as a bad request listing its problems", async () => {
    await expect(
      getRunnableFlowDefinition(
        { dataSources: { graphApi: {} } } as never,
        "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002" as never,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'steps.0.actionDefinitionId: There is no action "notAnAction"',
      ),
      extensions: { code: "BAD_REQUEST" },
    });
  });
});
