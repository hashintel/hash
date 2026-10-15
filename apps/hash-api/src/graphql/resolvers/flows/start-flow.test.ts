import { describe, expect, it, vi } from "vitest";

import { startFlow } from "./start-flow";

const mocks = vi.hoisted(() => ({
  startWorkflow: vi.fn(),
}));

vi.mock("./shared/get-runnable-flow-definition", () => ({
  getRunnableFlowDefinition: () => ({ flowDefinition: {}, flowType: "ai" }),
}));

const graphQLContext = {
  temporal: { workflow: { start: mocks.startWorkflow } },
  user: { accountId: "00000000-0000-0000-0000-000000000001" },
};

describe("startFlow", () => {
  it("rejects a stored payload reference in the flow inputs without starting a run", async () => {
    const run = startFlow(
      {},
      {
        dataSources: {},
        flowDefinition: {},
        flowDefinitionId: "00000000-0000-0000-0000-000000000002",
        flowInputs: {
          entities: {
            kind: "ProposedEntity",
            value: {
              __stored: true,
              kind: "ProposedEntity",
              storageKey: "flows/other-run/outputs/step-1",
              array: false,
            },
          },
        },
        webId: "00000000-0000-0000-0000-000000000001",
      } as never,
      graphQLContext as never,
      {} as never,
    );

    await expect(run).rejects.toMatchObject({
      message: expect.stringContaining('Flow input "entities"'),
      extensions: { code: "BAD_REQUEST" },
    });
    expect(mocks.startWorkflow).not.toHaveBeenCalled();
  });
});
