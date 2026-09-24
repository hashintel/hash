/** @vitest-environment jsdom */
import { createHash } from "node:crypto";

import { expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

import {
  integratedPetrinautClientToolNames,
  canonicalPetrinautClientToolNames,
} from "./brunch-client-tools";
import { resolveDraftAuthorityFromHistory } from "./brunch-draft-experiment-interactive-tool";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
} from "./brunch-petrinaut-tools";

import type { FlueConversationState } from "@flue/sdk";

vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});
const binding = {
  documentId: "document",
  incarnationId: "incarnation",
  conversationId: "conversation",
};
const markdown = "Decision: minimize waiting time under peak load.";
const input = {
  experiment: {
    name: "Baseline",
    scenarioId: "baseline",
    scenarioParameterValues: {},
    runCount: 10,
    seed: 42,
    dt: 0.1,
    maxTime: 10,
    metricIds: ["throughput"],
    execution: { mode: "simulate" as const },
  },
  declarations: [{ subject: "result", statement: "No guarantee." }],
  unsupported: [],
};
const settlement = {
  type: "dynamic-tool",
  toolCallId: "ledger-1",
  toolName: "mutate_workpiece",
  state: "output-available",
  input: { markdown },
  output: {
    revisionId: "ledger-1",
    sha256: createHash("sha256").update(markdown).digest("hex"),
    ordinal: 1,
    disposition: "applied",
  },
};
const draft = {
  type: "dynamic-tool",
  toolCallId: "draft-1",
  toolName: "draft_petrinaut_experiment",
  state: "output-available",
  input,
  output: { awaiting: "client" },
};
const history = async () => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      id: binding.documentId,
      initial: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
      capabilities: { disabledExtensions: [] },
    }),
  });
  const host = createCanonicalPetrinautHostTools({
    handle: instance.handle,
    binding,
    readTitle: () => "Queue",
    replayReadiness: {
      status: "ready",
      replay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
    },
    settleRevision: async () => {},
  });
  const read = host.tools.find(
    (tool) => tool.toolName === "getLatestNetDefinition",
  );
  if (!read) throw new Error("Missing canonical read");
  const output = read.execute({
    input: {},
    toolCallId: "read-1",
    handle: instance.handle,
    mutations: instance.mutations,
    commands: instance.commands,
    readDiagnosticsContext: async () => "",
    viewport: { frameSceneAfterRender: async () => "framed" },
    signal: new AbortController().signal,
  });
  const metadata = await host.clientToolResultMetadataFor("read-1", output);
  const readCall = {
    type: "dynamic-tool",
    toolCallId: "read-1",
    toolName: "getLatestNetDefinition",
    state: "output-available",
    input: {},
    output: { brunchBrowserResult: true, output, metadata },
  };
  const messages = [
    { role: "assistant", purpose: "assistant", parts: [settlement, readCall] },
    { role: "assistant", purpose: "assistant", parts: [draft] },
  ];
  return {
    snapshot: { messages } as FlueConversationState,
    revision: instance.handle.revisionId.get(),
  };
};

test("I retains canonical createExperiment and authorizes a draft from the latest settled Ledger and read revision", async () => {
  expect(canonicalPetrinautClientToolNames.has("createExperiment")).toBe(true);
  expect(
    canonicalPetrinautClientToolNames.has("draft_petrinaut_experiment"),
  ).toBe(false);
  expect(
    integratedPetrinautClientToolNames.has("draft_petrinaut_experiment"),
  ).toBe(true);
  const { snapshot, revision } = await history();
  await expect(
    resolveDraftAuthorityFromHistory(snapshot, binding, "draft-1"),
  ).resolves.toBe(revision);
  await expect(
    resolveDraftAuthorityFromHistory(snapshot, binding, "missing"),
  ).rejects.toThrow(/absent/u);
});

test("a changed net after the read requires another canonical read before a draft", async () => {
  const { snapshot } = await history();
  const changed = {
    type: "dynamic-tool",
    toolName: "addPlace",
    toolCallId: "changed",
    state: "output-available",
    input: { id: "place" },
    output: {
      brunchBrowserResult: true,
      output: { applied: true },
      metadata: { documentRevision: { before: "old", after: "new" } },
    },
  };
  const messages = [
    {
      ...snapshot.messages[0]!,
      parts: [...snapshot.messages[0]!.parts, changed],
    },
    ...snapshot.messages.slice(1),
  ];
  await expect(
    resolveDraftAuthorityFromHistory(
      { ...snapshot, messages } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/latest settled canonical net read/u);
});
