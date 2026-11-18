import { describe, expect, it, vi } from "vitest";

import {
  resolvePayloadValue,
  storePayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { StatusCode } from "@local/status";

import { createProposedEntity } from "../../shared/testing-utilities/create-proposed-entity.js";
import { takeFirstAction } from "./take-first-action.js";

import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type {
  Payload,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

const workflowId = "workflow";
const objects = new Map<string, string>();
const uploadDirect = vi.fn(({ key, body }: { key: string; body: string }) => {
  objects.set(key, body);
  return Promise.resolve();
});
const downloadDirect = vi.fn(({ key }: { key: string }) =>
  Promise.resolve(Buffer.from(objects.get(key) ?? "null")),
);
const storageProvider = {
  uploadDirect,
  downloadDirect,
} as unknown as FileStorageProvider;

vi.mock("../shared/get-flow-context.js", () => ({
  getFlowContext: () =>
    Promise.resolve({
      workflowId,
      runId: "run",
      stepId: "take",
      userAuthentication: { actorId: "user" },
    }),
}));
vi.mock(
  "@local/hash-backend-utils/flows/payload-storage",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getStorageProvider: () => storageProvider,
  }),
);

const run = (items: Payload, count: number) =>
  takeFirstAction({
    inputs: [
      { inputName: "items", payload: items },
      { inputName: "count", payload: { kind: "Number", value: count } },
    ] satisfies StepInput[],
  });

const entities = ["A", "B", "C"].map((summary, index) =>
  createProposedEntity({
    summary,
    localEntityId: `entity-${index}`,
  }),
);

const storedEntities = async (): Promise<Payload> => ({
  kind: "ProposedEntity",
  value: await storePayload({
    storageProvider,
    workflowId,
    runId: "run",
    stepId: "propose",
    outputName: "proposedEntities",
    kind: "ProposedEntity",
    value: entities,
  }),
});

describe("takeFirstAction", () => {
  it("stores the first items of a stored list", async () => {
    const items = await storedEntities();

    const result = await run(items, 2);

    const output = result.contents[0]?.outputs[0];
    expect(output).toMatchObject({
      outputName: "items",
      payload: { kind: "ProposedEntity", value: { __stored: true, length: 2 } },
    });
    expect(
      output &&
        (await resolvePayloadValue(
          { storageProvider, workflowId },
          output.payload.kind,
          output.payload.value,
        )),
    ).toEqual([entities[0], entities[1]]);
  });

  it("keeps nothing for a count of 0", async () => {
    expect(
      (await run({ kind: "Text", value: ["a", "b"] }, 0)).contents,
    ).toEqual([
      {
        outputs: [
          { outputName: "items", payload: { kind: "Text", value: [] } },
        ],
      },
    ]);
  });

  it("passes a stored list on unchanged for a count past its end, without fetching or storing it", async () => {
    const items = await storedEntities();
    uploadDirect.mockClear();
    downloadDirect.mockClear();

    const result = await run(items, 5);

    expect(result.contents[0]?.outputs[0]?.payload).toBe(items);
    expect(uploadDirect).not.toHaveBeenCalled();
    expect(downloadDirect).not.toHaveBeenCalled();
  });

  it("rejects an invalid count even when the list is short enough to keep whole", async () => {
    expect(await run({ kind: "Number", value: [1] }, 2.5)).toEqual({
      code: StatusCode.InvalidArgument,
      message: "The count must be a whole number, 0 or more.",
      contents: [],
    });
  });
});
