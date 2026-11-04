import { describe, expect, it, vi } from "vitest";

import { storePayload } from "@local/hash-backend-utils/flows/payload-storage";
import { StatusCode } from "@local/status";

import { createProposedEntity } from "../../shared/testing-utilities/create-proposed-entity.js";
import { ifAction } from "./if-action.js";

import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { FilterCondition } from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { StepInput } from "@local/hash-isomorphic-utils/flows/types";

const workflowId = "workflow";
const objects = new Map<string, string>();
const uploadDirect = vi.fn(({ key, body }: { key: string; body: string }) => {
  objects.set(key, body);
  return Promise.resolve();
});
const storageProvider = {
  uploadDirect,
  downloadDirect: ({ key }: { key: string }) =>
    Promise.resolve(Buffer.from(objects.get(key) ?? "null")),
} as unknown as FileStorageProvider;

vi.mock("../shared/graph-api-client.js", () => ({ graphApiClient: {} }));
vi.mock("../shared/get-flow-context.js", () => ({
  getFlowContext: () =>
    Promise.resolve({ workflowId, userAuthentication: { actorId: "user" } }),
}));
vi.mock(
  "@local/hash-backend-utils/flows/payload-storage",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getStorageProvider: () => storageProvider,
  }),
);

const hasSummary = (summary: string): FilterCondition => ({
  kind: "all",
  conditions: [
    {
      kind: "condition",
      subject: { kind: "field", path: ["summary"], payloadKind: "Text" },
      operator: "equals",
      value: { kind: "Text", value: summary },
    },
  ],
});

describe("ifAction", () => {
  it.each([
    { summary: "A company", outputName: "true" },
    { summary: "A person", outputName: "false" },
  ])(
    "returns the stored input on $outputName without storing it again",
    async ({ summary, outputName }) => {
      const value: StepInput = {
        inputName: "value",
        payload: {
          kind: "ProposedEntity",
          value: await storePayload({
            storageProvider,
            workflowId,
            runId: "run",
            stepId: "propose",
            outputName: "proposedEntity",
            kind: "ProposedEntity",
            value: createProposedEntity({ summary: "A company" }),
          }),
        },
      };
      uploadDirect.mockClear();

      const result = await ifAction({
        inputs: [
          value,
          {
            inputName: "condition",
            payload: { kind: "FilterCondition", value: hasSummary(summary) },
          },
        ],
      });

      expect(result.contents[0]?.outputs).toEqual([
        { outputName, payload: value.payload },
      ]);
      expect(result.contents[0]?.outputs[0]?.payload).toBe(value.payload);
      expect(uploadDirect).not.toHaveBeenCalled();
    },
  );

  it("fails without choosing a branch when the condition doesn't fit the value", async () => {
    const result = await ifAction({
      inputs: [
        { inputName: "value", payload: { kind: "Number", value: 6 } },
        {
          inputName: "condition",
          payload: { kind: "FilterCondition", value: hasSummary("A company") },
        },
      ],
    });

    expect(result).toMatchObject({
      code: StatusCode.InvalidArgument,
      contents: [],
    });
  });
});
