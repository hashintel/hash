import { expect, test } from "vitest";

import {
  mutatePetrinautNetToolName,
  readPetrinautNetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import {
  createJoinedBrowserMutationRecorder,
  observeBrowserDefinition,
} from "./mutation-record";

const createRecorder = () => {
  const handle = createJsonDocHandle({
    id: "document",
    initial: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
    capabilities: { disabledExtensions: [] },
  });
  const recorder = createJoinedBrowserMutationRecorder({
    handle,
    binding: {
      conversationId: "conversation",
      documentId: handle.id,
      incarnationId: "incarnation",
    },
  });
  return { handle, recorder };
};

test("validates only the canonical batched mutation tool", () => {
  const { recorder } = createRecorder();
  expect([...recorder.validatedClientToolNames]).toEqual([
    mutatePetrinautNetToolName,
  ]);
});

test("promotes a verified net-read observation into model-visible output", () => {
  const { handle, recorder } = createRecorder();
  const call = {
    toolCallId: "read",
    toolName: readPetrinautNetToolName,
    input: {},
  };
  recorder.mapClientToolInput(call);
  const result = {
    ...call,
    output: { definition: structuredClone(handle.doc()) },
  };
  const metadata = recorder.clientToolResultMetadata(result);

  expect(recorder.clientToolResultOutput(result, metadata)).toEqual({
    definition: handle.doc(),
    observation: {
      toolCallId: "read",
      sha256: observeBrowserDefinition(handle).sha256,
    },
  });
});
