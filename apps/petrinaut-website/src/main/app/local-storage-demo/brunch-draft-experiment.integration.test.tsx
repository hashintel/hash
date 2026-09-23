/** @vitest-environment jsdom */
import { createHash } from "node:crypto";

import { expect, test, vi } from "vitest";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";
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
const markdown =
  "Decision: vary staffing from 2 to 8 people, minimizing waiting time under peak load for 120 minutes.";
const sha256 = createHash("sha256").update(markdown).digest("hex");
const settlement = {
  type: "dynamic-tool",
  toolCallId: "ledger-1",
  toolName: "mutate_workpiece",
  state: "output-available",
  input: { markdown },
  output: {
    revisionId: "ledger-1",
    sha256,
    ordinal: 1,
    disposition: "applied",
  },
};
const issuedInput = {
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
const authorize = (
  snapshot: FlueConversationState,
  targetBinding: typeof binding,
  toolCallId: string,
) =>
  resolveDraftAuthorityFromHistory(
    snapshot,
    targetBinding,
    toolCallId,
    issuedInput,
  );
const draft = {
  type: "dynamic-tool",
  toolCallId: "draft-1",
  toolName: "draft_petrinaut_experiment",
  state: "output-available",
  input: issuedInput,
  output: { awaiting: AWAITING_CLIENT },
};

/** Real canonical host read, correlated via the existing dispatch sidecar. */
const makeHistory = () => {
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
  const readCall = {
    type: "dynamic-tool",
    toolCallId: "read-1",
    toolName: "getLatestNetDefinition",
    state: "output-available",
    input: {},
    output: { awaiting: AWAITING_CLIENT },
  };
  const messages = [
    { role: "assistant", purpose: "assistant", parts: [settlement, readCall] },
    {
      role: "system",
      purpose: "dispatch",
      signal: { tagName: "client-tool-result" },
      parts: [
        {
          type: "text",
          text: JSON.stringify([
            {
              toolCallId: "read-1",
              toolName: "getLatestNetDefinition",
              output,
              metadata: host.clientToolResultMetadataFor("read-1", output),
            },
          ]),
        },
      ],
    },
    { role: "assistant", purpose: "assistant", parts: [draft] },
  ];
  return { snapshot: { messages } as FlueConversationState, host };
};

test("integrated draft is distinct from canonical createExperiment and authorizes the exact host read before its call", async () => {
  expect(canonicalPetrinautClientToolNames.has("createExperiment")).toBe(true);
  expect(
    canonicalPetrinautClientToolNames.has("draft_petrinaut_experiment"),
  ).toBe(false);
  expect(integratedPetrinautClientToolNames.has("createExperiment")).toBe(true);
  expect(
    integratedPetrinautClientToolNames.has("draft_petrinaut_experiment"),
  ).toBe(true);
  const { snapshot, host } = makeHistory();
  expect(host.tools.map((tool) => tool.toolName)).not.toContain(
    "draft_petrinaut_experiment",
  );
  await expect(authorize(snapshot, binding, "draft-1")).resolves.toMatch(
    /^[a-f0-9]{64}$/u,
  );
  await expect(authorize(snapshot, binding, "missing")).rejects.toThrow(
    /absent or ambiguous/u,
  );
  await expect(
    authorize(snapshot, { ...binding, conversationId: "other" }, "draft-1"),
  ).rejects.toThrow(/unverified/u);
  const collidingPingCall = {
    role: "assistant",
    purpose: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "read-1",
        toolName: "ping",
        state: "output-available",
        input: {},
        output: { ok: true },
      },
    ],
  };
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [
          ...snapshot.messages.slice(0, -1),
          collidingPingCall,
          snapshot.messages.at(-1)!,
        ],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/conflicting call or result identity/u);
  const collidingPingResult = {
    role: "system",
    purpose: "dispatch",
    signal: { tagName: "client-tool-result" },
    parts: [
      {
        type: "text",
        text: JSON.stringify([
          { toolCallId: "read-1", toolName: "ping", output: { ok: true } },
        ]),
      },
    ],
  };
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [
          ...snapshot.messages.slice(0, -1),
          collidingPingResult,
          snapshot.messages.at(-1)!,
        ],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/conflicting call or result identity/u);
  await expect(
    resolveDraftAuthorityFromHistory(snapshot, binding, "draft-1", {
      ...issuedInput,
      declarations: [],
    }),
  ).rejects.toThrow(/does not match/u);
});

test("only a verified intervening canonical experiment preserves the draft read", async () => {
  const { snapshot } = makeHistory();
  const dispatch = snapshot.messages[1];
  if (!dispatch) throw new Error("Missing canonical read dispatch");
  const recorded = JSON.parse((dispatch.parts[0] as { text: string }).text) as {
    output: { definition: unknown };
    metadata: {
      observation: { observed: { sha256: string; revisionId?: string } };
    };
  }[];
  const read = recorded[0];
  if (!read) throw new Error("Missing canonical read terminal");
  const toolCallId = "experiment-1";
  const input = issuedInput.experiment;
  const output = {
    status: "complete",
    experimentId: toolCallId,
    name: input.name,
    runsCompleted: 10,
    metrics: [{ id: "throughput", label: "Throughput", value: 2 }],
  };
  const experimentCall = {
    role: "assistant",
    purpose: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId,
        toolName: "createExperiment",
        state: "output-available",
        input,
        output: { awaiting: AWAITING_CLIENT },
      },
    ],
  };
  const result = {
    toolCallId,
    toolName: "createExperiment",
    output,
    metadata: {
      experimentRecord: {
        toolCallId,
        binding,
        input,
        source: {
          definition: read.output.definition,
          sha256: read.metadata.observation.observed.sha256,
          revisionId:
            read.metadata.observation.observed.revisionId ?? "source-revision",
        },
        output,
      },
    },
  };
  const resultMessage = {
    role: "system",
    purpose: "dispatch",
    signal: { tagName: "client-tool-result" },
    parts: [{ type: "text", text: JSON.stringify([result]) }],
  };
  const beforeDraft = snapshot.messages.slice(0, -1);
  const draftMessage = snapshot.messages.at(-1)!;
  const verified = {
    ...snapshot,
    messages: [...beforeDraft, experimentCall, resultMessage, draftMessage],
  } as FlueConversationState;
  await expect(authorize(verified, binding, "draft-1")).resolves.toMatch(
    /^[a-f0-9]{64}$/u,
  );
  const unverified = {
    ...snapshot,
    messages: [
      ...beforeDraft,
      experimentCall,
      {
        ...resultMessage,
        parts: [
          {
            type: "text",
            text: JSON.stringify([
              { toolCallId, toolName: "createExperiment", output },
            ]),
          },
        ],
      },
      draftMessage,
    ],
  } as FlueConversationState;
  await expect(authorize(unverified, binding, "draft-1")).rejects.toThrow(
    /after all changes/u,
  );
});

test("history prefix refuses a missing or ambiguous Ledger/read rather than choosing another call", async () => {
  const { snapshot } = makeHistory();
  const messages = snapshot.messages;
  const assistant = messages[0];
  if (!assistant) throw new Error("Missing assistant history");
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [{ ...assistant, parts: [draft] }],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/Ledger/u);
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [...messages, { ...assistant, parts: [draft] }],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/ambiguous/u);
  const interveningMutation = {
    ...assistant,
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "mutation-1",
        toolName: "addPlace",
        state: "output-available",
        input: {},
        output: { awaiting: AWAITING_CLIENT },
      },
    ],
  };
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [
          ...messages.slice(0, -1),
          interveningMutation,
          messages.at(-1)!,
        ],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/after all changes/u);
  const diagnostics = {
    ...assistant,
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "diagnostics",
        toolName: "getNetCompilationErrors",
        state: "output-available",
        input: {},
        output: { awaiting: AWAITING_CLIENT },
      },
      {
        type: "dynamic-tool",
        toolCallId: "documentation",
        toolName: "readPetrinautDoc",
        state: "output-available",
        input: {},
        output: { awaiting: AWAITING_CLIENT },
      },
    ],
  };
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [...messages.slice(0, -1), diagnostics, messages.at(-1)!],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).resolves.toMatch(/^[a-f0-9]{64}$/u);
  for (const [index, toolName] of [
    "applyAutoLayout",
    "setNetTitle",
    "createExperiment",
    "mutate_petrinaut_net",
  ].entries()) {
    const intervening = {
      ...assistant,
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: `intervening-${index}`,
          toolName,
          state: "output-available",
          input: {},
          output: { awaiting: AWAITING_CLIENT },
        },
      ],
    };
    await expect(
      authorize(
        {
          ...snapshot,
          messages: [...messages.slice(0, -1), intervening, messages.at(-1)!],
        } as FlueConversationState,
        binding,
        "draft-1",
      ),
    ).rejects.toThrow(/after all changes/u);
  }
  const colliding = {
    ...assistant,
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "draft-1",
        toolName: "ping",
        state: "output-available",
        input: {},
        output: {},
      },
    ],
  };
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [...messages.slice(0, -1), colliding, messages.at(-1)!],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/ambiguous/u);
  const dispatch = messages[1];
  if (!dispatch) throw new Error("Missing read dispatch");
  const readResults = JSON.parse(
    (dispatch.parts[0] as { text: string }).text,
  ) as unknown[];
  const duplicateDispatch = {
    ...dispatch,
    parts: [
      { type: "text", text: JSON.stringify([...readResults, ...readResults]) },
    ],
  };
  await expect(
    authorize(
      {
        ...snapshot,
        messages: [messages[0]!, duplicateDispatch, messages[2]!],
      } as FlueConversationState,
      binding,
      "draft-1",
    ),
  ).rejects.toThrow(/conflicting call or result identity/u);
});
