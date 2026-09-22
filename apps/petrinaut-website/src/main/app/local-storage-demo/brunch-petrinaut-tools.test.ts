/** @vitest-environment jsdom */
import { describe, expect, test, vi } from "vitest";

import {
  parseClientToolResultMetadata,
  verifyCanonicalMutationRecord,
  verifyExperimentRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";
import {
  createExperimentToolName,
  createJsonDocHandle,
  createPetrinaut,
  type PetrinautExperimentResult,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  createCanonicalPetrinautHostTools,
  deriveCanonicalPetrinautReplay,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  type CanonicalPetrinautReplayReadiness,
} from "./brunch-petrinaut-tools";
import { foldBrunchWorkpieceHistory } from "./brunch-workpiece-history";

import type {
  BrowserAddPlaceRecord,
  BrowserToolRecord,
} from "./mutation-record";
import type { PetrinautAiAutomaticToolExecuteParams } from "@hashintel/petrinaut/ui";

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

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const placeInput = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  targetSubnetId: null,
};

const transitionInput = {
  id: "serve",
  name: "Serve",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate" as const,
  lambdaCode: "",
  transitionKernelCode: "",
  x: 100,
  y: 0,
  targetSubnetId: null,
};

const arcInput = {
  transitionId: "serve",
  arcDirection: "input" as const,
  placeId: "queue",
  weight: 1,
  type: "standard" as const,
  targetSubnetId: null,
};

const experimentInput = {
  name: "Queue baseline",
  scenarioId: "baseline",
  scenarioParameterValues: {},
  runCount: 10,
  seed: 42,
  dt: 0.1,
  maxTime: 10,
  metricIds: ["throughput"],
  execution: { mode: "simulate" as const },
};

const experimentOutput = (
  status: PetrinautExperimentResult["status"],
): PetrinautExperimentResult => ({
  status,
  experimentId: status === "error" ? null : "experiment-1",
  name: experimentInput.name,
  ...(status === "complete" ? {} : { message: `${status} terminal result` }),
  runsCompleted: status === "complete" ? 10 : 3,
  metrics: [{ id: "throughput", label: "Throughput", value: 2 }],
});

const requireAddPlaceRecord = (
  record: BrowserToolRecord | undefined,
): BrowserAddPlaceRecord => {
  if (record?.toolName !== "addPlace")
    throw new Error("Missing addPlace metadata");
  return record;
};

const loadServerMutationVerifier = async () => {
  const modulePath =
    "../../../../../brunch-agent/src/conversation/mutation-delivery.ts";
  const loaded: unknown = await vi.importActual(modulePath);
  if (
    typeof loaded !== "object" ||
    loaded === null ||
    !("verifyMutationResults" in loaded) ||
    typeof loaded.verifyMutationResults !== "function"
  )
    throw new Error("Missing Brunch mutation continuation verifier.");
  return loaded.verifyMutationResults as (input: {
    body: string;
    snapshot: unknown;
    binding: {
      documentId: string;
      incarnationId: string;
      conversationId: string;
    };
  }) => Promise<void>;
};

const setup = (
  replayReadiness: CanonicalPetrinautReplayReadiness = {
    status: "ready",
    replay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
  },
) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      id: "document",
      initial: structuredClone(emptyNet),
      capabilities: { disabledExtensions: [] },
    }),
  });
  const settleRevision = vi.fn(async (): Promise<void> => undefined);
  const adapter = createCanonicalPetrinautHostTools({
    handle: instance.handle,
    binding: {
      documentId: "document",
      incarnationId: "incarnation",
      conversationId: "conversation",
    },
    readTitle: () => "Untitled",
    replayReadiness,
    settleRevision,
  });
  const tool = (name: string) => {
    const found = adapter.tools.find(({ toolName }) => toolName === name);
    if (!found) throw new Error(`Missing ${name}`);
    return found;
  };
  const params = (
    rawInput: unknown,
    readDiagnosticsContext = async () => "No current TypeScript diagnostics.",
    toolCallId = "call-1",
  ): PetrinautAiAutomaticToolExecuteParams => ({
    input: rawInput,
    mutations: instance.mutations,
    commands: instance.commands,
    handle: instance.handle,
    readDiagnosticsContext,
    viewport: { frameSceneAfterRender: async () => "framed" },
    toolCallId,
    signal: new AbortController().signal,
  });
  return { adapter, instance, params, settleRevision, tool };
};

describe("canonical Petrinaut browser host tools", () => {
  test("exposes only canonical names and canonical read/diagnostics outputs", async () => {
    const { adapter, instance, params, tool } = setup();
    expect(adapter.tools.map(({ toolName }) => toolName)).toEqual([
      "getLatestNetDefinition",
      "getNetCompilationErrors",
      "addPlace",
      "addTransition",
      "addArc",
    ]);
    const readOutput = tool("getLatestNetDefinition").execute(params({}));
    expect(readOutput).toEqual(
      expect.objectContaining({
        title: "Untitled",
        definition: instance.handle.doc(),
      }),
    );
    expect(readOutput).not.toHaveProperty("observation");
    const readMetadata = adapter.metadataFor("call-1");
    if (readMetadata?.toolName !== "getLatestNetDefinition")
      throw new Error("Missing bound read metadata");
    expect(readMetadata.binding).toEqual({
      documentId: "document",
      incarnationId: "incarnation",
      conversationId: "conversation",
    });
    expect(readMetadata.observation.definition).toEqual(instance.handle.doc());
    expect(readMetadata.observation.revisionId).toBe(
      instance.handle.revisionId.get(),
    );
    expect(
      parseClientToolResultMetadata(
        adapter.clientToolResultMetadataFor("call-1"),
      ),
    ).toEqual({
      observation: {
        toolCallId: "call-1",
        binding: readMetadata.binding,
        observed: readMetadata.observation,
      },
    });
    await expect(
      tool("getNetCompilationErrors").execute(
        params({}, async () => "diagnostics pending for current revision"),
      ),
    ).resolves.toBe("diagnostics pending for current revision");
  });

  test("replays a retained read observation while a new identity observes live state", () => {
    const { adapter, instance, params, tool } = setup();
    const readTool = tool("getLatestNetDefinition");
    const firstOutput = readTool.execute(params({}));
    const firstMetadata = adapter.metadataFor("call-1");
    if (firstMetadata?.toolName !== "getLatestNetDefinition")
      throw new Error("Missing first read metadata");

    instance.handle.change((draft) => {
      draft.places.push({
        id: "later",
        name: "Later",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      });
    });

    const duplicateOutput = readTool.execute(params({}));
    expect(duplicateOutput).toEqual(firstOutput);
    expect(adapter.metadataFor("call-1")).toEqual(firstMetadata);
    expect(() => readTool.execute(params({ unexpected: true }))).toThrow();

    const newOutput = readTool.execute(params({}, undefined, "call-2"));
    expect(newOutput).not.toEqual(firstOutput);
    const newMetadata = adapter.metadataFor("call-2");
    if (newMetadata?.toolName !== "getLatestNetDefinition")
      throw new Error("Missing new read metadata");
    expect(newMetadata.observation.definition.places).toHaveLength(1);
    expect(newMetadata.observation.sha256).not.toBe(
      firstMetadata.observation.sha256,
    );
  });

  test("records canonical experiment terminals against the source projected to Petrinaut", async () => {
    for (const status of ["complete", "cancelled", "error"] as const) {
      const { adapter, instance } = setup();
      const toolCallId = `experiment-${status}`;
      const projected = adapter.mapClientToolInput({
        input: experimentInput,
        toolCallId,
        toolName: createExperimentToolName,
      });
      expect(projected).toBe(experimentInput);
      const projectedRevision = instance.handle.revisionId.get();

      instance.handle.change((draft) => {
        draft.places.push({ ...placeInput, id: `later-${status}` });
      });
      const output = experimentOutput(status);
      const metadata = adapter.clientToolResultMetadataFor(toolCallId, output);
      const record = parseClientToolResultMetadata(metadata)?.experimentRecord;
      expect(record?.source.revisionId).toBe(projectedRevision);
      expect(record?.source.definition).toEqual(emptyNet);
      expect(record?.source.definition).not.toEqual(instance.handle.doc());
      expect(record?.input).toEqual(experimentInput);
      expect(record?.output).toEqual(output);
      await expect(
        verifyExperimentRecord({
          record,
          toolCallId,
          canonicalInput: experimentInput,
          canonicalOutput: output,
          binding: {
            documentId: "document",
            incarnationId: "incarnation",
            conversationId: "conversation",
          },
        }),
      ).resolves.toEqual(expect.objectContaining({ output }));
    }
  });

  test("fails closed on conflicting experiment identities and never fabricates an unprojected record", () => {
    const { adapter } = setup();
    const call = {
      input: experimentInput,
      toolCallId: "experiment-call",
      toolName: createExperimentToolName,
    };
    expect(adapter.mapClientToolInput(call)).toBe(experimentInput);
    expect(adapter.mapClientToolInput(call)).toBe(experimentInput);
    expect(() =>
      adapter.mapClientToolInput({
        ...call,
        input: { ...experimentInput, runCount: 11 },
      }),
    ).toThrow("Conflicting duplicate experiment projection");

    const sourceConflict = setup();
    sourceConflict.adapter.mapClientToolInput(call);
    sourceConflict.instance.handle.change((draft) => {
      draft.places.push({ ...placeInput, id: "conflicting-source" });
    });
    expect(() => sourceConflict.adapter.mapClientToolInput(call)).toThrow(
      "Conflicting duplicate experiment projection",
    );

    const output = experimentOutput("complete");
    const first = adapter.clientToolResultMetadataFor(call.toolCallId, output);
    expect(
      adapter.clientToolResultMetadataFor(
        call.toolCallId,
        structuredClone(output),
      ),
    ).toEqual(first);
    expect(() =>
      adapter.clientToolResultMetadataFor(call.toolCallId, {
        ...output,
        runsCompleted: 9,
      }),
    ).toThrow("Conflicting duplicate experiment result");
    expect(
      adapter.clientToolResultMetadataFor("missing-projection", output),
    ).toBeUndefined();
    expect(
      adapter.mapClientToolInput({
        input: { untouched: true },
        toolCallId: "other-call",
        toolName: "otherCanonicalTool",
      }),
    ).toEqual({ untouched: true });
  });

  test("blocks pending and ambiguous experiment replay while verified terminals remain inert", async () => {
    const pending = setup({ status: "pending" });
    expect(() =>
      pending.adapter.mapClientToolInput({
        input: experimentInput,
        toolCallId: "pending-experiment",
        toolName: createExperimentToolName,
      }),
    ).toThrow(
      "Canonical tool replay verification is not ready for this conversation",
    );
    expect(
      pending.adapter.clientToolResultMetadataFor(
        "pending-experiment",
        experimentOutput("complete"),
      ),
    ).toBeUndefined();

    const original = setup();
    original.adapter.mapClientToolInput({
      input: experimentInput,
      toolCallId: "experiment-call",
      toolName: createExperimentToolName,
    });
    const output = experimentOutput("complete");
    const metadata = original.adapter.clientToolResultMetadataFor(
      "experiment-call",
      output,
    );
    const assistantCall = {
      type: "dynamic-tool",
      state: "output-available",
      toolCallId: "experiment-call",
      toolName: createExperimentToolName,
      input: experimentInput,
      output: { awaiting: AWAITING_CLIENT },
    };
    const result = {
      toolCallId: "experiment-call",
      toolName: createExperimentToolName,
      output,
      metadata,
    };
    const derive = (results: readonly unknown[]) =>
      deriveCanonicalPetrinautReplay({
        snapshot: {
          messages: [
            { role: "assistant", purpose: "assistant", parts: [assistantCall] },
            {
              role: "system",
              purpose: "dispatch",
              signal: { tagName: "client-tool-result" },
              parts: [{ type: "text", text: JSON.stringify(results) }],
            },
          ],
        } as never,
        binding: {
          documentId: "document",
          incarnationId: "incarnation",
          conversationId: "conversation",
        },
      });

    const terminalReplay = await derive([result]);
    expect(terminalReplay.terminalExperiments.has("experiment-call")).toBe(
      true,
    );
    const terminal = setup({ status: "ready", replay: terminalReplay });
    expect(() =>
      terminal.adapter.mapClientToolInput({
        input: experimentInput,
        toolCallId: "experiment-call",
        toolName: createExperimentToolName,
      }),
    ).toThrow("already has a verified terminal result");
    expect(
      terminal.adapter.clientToolResultMetadataFor("experiment-call", output),
    ).toBeUndefined();

    const experimentRecord = metadata?.experimentRecord;
    if (experimentRecord === undefined)
      throw new Error("Missing experiment replay fixture.");
    for (const results of [
      [],
      [result, structuredClone(result)],
      [{ ...result, toolName: "wrongExperimentName" }],
      [{ ...result, output: { ...output, runsCompleted: 9 } }],
      [
        {
          ...result,
          metadata: {
            experimentRecord: {
              ...experimentRecord,
              binding: {
                ...experimentRecord.binding,
                incarnationId: "wrong-incarnation",
              },
            },
          },
        },
      ],
      [
        {
          ...result,
          metadata: {
            experimentRecord: {
              ...experimentRecord,
              source: {
                ...experimentRecord.source,
                sha256: "0".repeat(64),
              },
            },
          },
        },
      ],
    ]) {
      const blockedReplay = await derive(results);
      expect(blockedReplay.blockedCalls.has("experiment-call")).toBe(true);
      const blocked = setup({ status: "ready", replay: blockedReplay });
      expect(() =>
        blocked.adapter.mapClientToolInput({
          input: experimentInput,
          toolCallId: "experiment-call",
          toolName: createExperimentToolName,
        }),
      ).toThrow();
      expect(
        blocked.adapter.clientToolResultMetadataFor("experiment-call", output),
      ).toBeUndefined();
    }
  });

  test("parses the canonical addPlace schema before executing", async () => {
    const { instance, params, tool } = setup();
    const addPlace = vi.spyOn(instance.mutations, "addPlace");
    await expect(
      tool("addPlace").execute(params({ id: "incomplete" })),
    ).rejects.toThrow();
    expect(addPlace).not.toHaveBeenCalled();
  });

  test("waits for the exact repository revision and required diagnostics before success", async () => {
    const { adapter, instance, params, settleRevision, tool } = setup();
    const settlement = Promise.withResolvers<void>();
    settleRevision.mockImplementation(() => settlement.promise);
    const diagnostics = Promise.withResolvers<string>();
    const codeBearingInput = {
      ...placeInput,
      visualizerCode: "export default Visualization(() => <svg />)",
    };

    let output: unknown;
    const execution = Promise.resolve(
      tool("addPlace").execute(
        params(codeBearingInput, () => diagnostics.promise),
      ),
    ).then((value) => {
      output = value;
    });

    await vi.waitFor(() => expect(settleRevision).toHaveBeenCalledOnce());
    const revisionId = instance.handle.revisionId.get();
    expect(settleRevision).toHaveBeenCalledWith({
      documentId: "document",
      revisionId,
    });
    expect(adapter.metadataFor("call-1")).toEqual(
      expect.objectContaining({
        outcome: "applied",
        settlement: { status: "pending", revisionId },
        diagnostics: { status: "pending" },
      }),
    );
    expect(
      requireAddPlaceRecord(adapter.metadataFor("call-1")).effects?.created.map(
        ({ path }) => path,
      ),
    ).toContain("/places/0/id");
    expect(output).toBeUndefined();

    settlement.resolve();
    await vi.waitFor(() =>
      expect(
        requireAddPlaceRecord(adapter.metadataFor("call-1")).settlement.status,
      ).toBe("settled"),
    );
    expect(output).toBeUndefined();
    diagnostics.resolve("No current TypeScript diagnostics.");
    await execution;
    expect(output).toEqual({
      applied: true,
      title: "Added place Queue",
      target: {
        kind: "selection",
        item: { type: "place", id: "queue" },
      },
    });
    expect(
      requireAddPlaceRecord(adapter.metadataFor("call-1")).diagnostics,
    ).toEqual({
      status: "settled",
      value: "No current TypeScript diagnostics.",
    });
    const wireMetadata = parseClientToolResultMetadata(
      adapter.clientToolResultMetadataFor("call-1"),
    );
    expect(wireMetadata?.canonicalMutationRecord).toEqual(
      expect.objectContaining({
        toolCallId: "call-1",
        toolName: "addPlace",
        input: codeBearingInput,
        outcome: "applied",
        output,
      }),
    );
    await expect(
      verifyCanonicalMutationRecord({
        record: wireMetadata?.canonicalMutationRecord,
        toolCallId: "call-1",
        toolName: "addPlace",
        canonicalInput: codeBearingInput,
        canonicalOutput: output,
        binding: {
          documentId: "document",
          incarnationId: "incarnation",
          conversationId: "conversation",
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ outcome: "applied" }));
  });

  test("returns Petrinaut's exact canonical no-op output", async () => {
    const { adapter, instance, params, settleRevision, tool } = setup();
    vi.spyOn(instance.mutations, "addPlace").mockImplementation(() => {});
    const output = {
      applied: false,
      reason: "Added place Queue left the document unchanged.",
    };
    await expect(tool("addPlace").execute(params(placeInput))).resolves.toEqual(
      output,
    );
    expect(settleRevision).not.toHaveBeenCalled();
    const record = parseClientToolResultMetadata(
      adapter.clientToolResultMetadataFor("call-1"),
    )?.canonicalMutationRecord;
    expect(record).toEqual(
      expect.objectContaining({ outcome: "no-op", output }),
    );
    expect(record?.post?.revisionId).toBe(record?.pre.revisionId);
    expect(record?.post?.sha256).toBe(record?.pre.sha256);
    await expect(
      verifyCanonicalMutationRecord({
        record,
        toolCallId: "call-1",
        toolName: "addPlace",
        canonicalInput: placeInput,
        canonicalOutput: output,
        binding: {
          documentId: "document",
          incarnationId: "incarnation",
          conversationId: "conversation",
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ outcome: "no-op" }));
  });

  test("does not run diagnostics for a plain structural addPlace", async () => {
    const { adapter, params, tool } = setup();
    const readDiagnosticsContext = vi.fn(async () => "not read");
    await tool("addPlace").execute(params(placeInput, readDiagnosticsContext));
    expect(readDiagnosticsContext).not.toHaveBeenCalled();
    expect(
      requireAddPlaceRecord(adapter.metadataFor("call-1")).diagnostics,
    ).toEqual({ status: "not-required" });
  });

  test("runs diagnostics for code-bearing transitions but not plain transitions or arcs", async () => {
    const { adapter, params, tool } = setup();
    const transitionDiagnostics = vi.fn(async () => "transition diagnostics");
    const plainDiagnostics = vi.fn(async () => "not read");
    const arcDiagnostics = vi.fn(async () => "not read");

    await tool("addPlace").execute(
      params(placeInput, plainDiagnostics, "place-call"),
    );
    await tool("addTransition").execute(
      params(
        { ...transitionInput, id: "plain", name: "Plain" },
        plainDiagnostics,
        "plain-transition-call",
      ),
    );
    await tool("addTransition").execute(
      params(
        { ...transitionInput, lambdaCode: "return true;" },
        transitionDiagnostics,
        "coded-transition-call",
      ),
    );
    await tool("addArc").execute(params(arcInput, arcDiagnostics, "arc-call"));

    expect(transitionDiagnostics).toHaveBeenCalledOnce();
    expect(plainDiagnostics).not.toHaveBeenCalled();
    expect(arcDiagnostics).not.toHaveBeenCalled();
    expect(adapter.metadataFor("coded-transition-call")).toEqual(
      expect.objectContaining({
        diagnostics: {
          status: "settled",
          value: "transition diagnostics",
        },
      }),
    );
    expect(adapter.metadataFor("arc-call")).toEqual(
      expect.objectContaining({ diagnostics: { status: "not-required" } }),
    );
  });

  test("returns settlement refusal as an explicit terminal failure with a durable sidecar", async () => {
    const { adapter, params, settleRevision, tool } = setup();
    settleRevision.mockRejectedValue(new Error("write refused"));
    const output = await tool("addPlace").execute(params(placeInput));
    expect(output).toEqual({
      applied: false,
      reason: "The document revision was not settled: write refused",
    });
    const metadata = requireAddPlaceRecord(adapter.metadataFor("call-1"));
    expect(metadata.outcome).toBe("unknown");
    expect(metadata.settlement.status).toBe("failed");
    expect(metadata.error).toContain("write refused");
    const record = parseClientToolResultMetadata(
      adapter.clientToolResultMetadataFor("call-1"),
    )?.canonicalMutationRecord;
    expect(record).toEqual(
      expect.objectContaining({ outcome: "unknown", output }),
    );
    const verified = await verifyCanonicalMutationRecord({
      record,
      toolCallId: "call-1",
      toolName: "addPlace",
      canonicalInput: placeInput,
      canonicalOutput: output,
      binding: {
        documentId: "document",
        incarnationId: "incarnation",
        conversationId: "conversation",
      },
    });
    expect(verified.outcome).toBe("unknown");
    expect(verified.settlement.status).toBe("failed");

    const binding = {
      documentId: "document",
      incarnationId: "incarnation",
      conversationId: "conversation",
    };
    const history = foldBrunchWorkpieceHistory(
      [
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              state: "output-available",
              toolCallId: "call-1",
              toolName: "addPlace",
              input: placeInput,
              output: { disposition: "awaiting-client" },
            },
          ],
        },
        {
          role: "system",
          purpose: "dispatch",
          signal: { tagName: "client-tool-result" },
          parts: [
            {
              type: "text",
              text: JSON.stringify([
                {
                  toolCallId: "call-1",
                  toolName: "addPlace",
                  output,
                  metadata: { canonicalMutationRecord: record },
                },
              ]),
            },
          ],
        },
      ],
      binding,
    );
    expect(history.activityIdentities).toEqual(["call-1"]);
  });

  test("records callback evidence and returns a terminal failure for continuation", async () => {
    const { adapter, instance, params, tool } = setup();
    const callbackError = new Error("canonical callback refused");
    vi.spyOn(instance.mutations, "addPlace").mockImplementation(() => {
      throw callbackError;
    });
    await expect(tool("addPlace").execute(params(placeInput))).resolves.toEqual(
      {
        applied: false,
        reason: "canonical callback refused",
      },
    );
    expect(adapter.metadataFor("call-1")).toEqual(
      expect.objectContaining({
        outcome: "failed",
        effects: { created: [], updated: [], deleted: [], derived: [] },
        error: "canonical callback refused",
      }),
    );
  });

  test("keeps a settled structural success when its diagnostics read fails", async () => {
    const { adapter, params, tool } = setup();
    const codeBearingInput = {
      ...placeInput,
      visualizerCode: "export default Visualization(() => <svg />)",
    };
    const output = {
      applied: true,
      title: "Added place Queue",
      target: {
        kind: "selection",
        item: { type: "place", id: "queue" },
      },
    };
    await expect(
      tool("addPlace").execute(
        params(codeBearingInput, async () => {
          throw new Error("diagnostics unavailable");
        }),
      ),
    ).resolves.toEqual(output);
    const record = parseClientToolResultMetadata(
      adapter.clientToolResultMetadataFor("call-1"),
    )?.canonicalMutationRecord;
    expect(record?.outcome).toBe("applied");
    expect(record?.settlement.status).toBe("settled");
    expect(record?.diagnostics).toEqual({
      status: "failed",
      error: "diagnostics unavailable",
    });
    await expect(
      verifyCanonicalMutationRecord({
        record,
        toolCallId: "call-1",
        toolName: "addPlace",
        canonicalInput: codeBearingInput,
        canonicalOutput: output,
        binding: {
          documentId: "document",
          incarnationId: "incarnation",
          conversationId: "conversation",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: "applied",
        output,
      }),
    );
  });

  test("queues concurrent siblings in invocation order so addArc sees its endpoints", async () => {
    const { adapter, instance, params, settleRevision, tool } = setup();
    const firstSettlement = Promise.withResolvers<void>();
    settleRevision.mockImplementationOnce(() => firstSettlement.promise);
    const callbackOrder: string[] = [];
    const originalAddPlace = instance.mutations.addPlace.bind(
      instance.mutations,
    );
    vi.spyOn(instance.mutations, "addPlace").mockImplementation(
      (mutationInput) => {
        callbackOrder.push("addPlace");
        originalAddPlace(mutationInput);
      },
    );
    const originalAddTransition = instance.mutations.addTransition.bind(
      instance.mutations,
    );
    vi.spyOn(instance.mutations, "addTransition").mockImplementation(
      (mutationInput) => {
        callbackOrder.push("addTransition");
        originalAddTransition(mutationInput);
      },
    );
    const originalAddArc = instance.mutations.addArc.bind(instance.mutations);
    vi.spyOn(instance.mutations, "addArc").mockImplementation(
      (mutationInput) => {
        callbackOrder.push("addArc");
        originalAddArc(mutationInput);
      },
    );

    const placeExecution = tool("addPlace").execute(
      params(placeInput, undefined, "place-call"),
    );
    const transitionExecution = tool("addTransition").execute(
      params(transitionInput, undefined, "transition-call"),
    );
    const arcExecution = tool("addArc").execute(
      params(arcInput, undefined, "arc-call"),
    );
    const duplicatePlaceExecution = tool("addPlace").execute(
      params(placeInput, undefined, "place-call"),
    );
    await expect(
      tool("addPlace").execute(
        params({ ...placeInput, name: "Conflict" }, undefined, "place-call"),
      ),
    ).rejects.toThrow("Conflicting duplicate canonical tool call");

    await vi.waitFor(() => expect(settleRevision).toHaveBeenCalledOnce());
    expect(callbackOrder).toEqual(["addPlace"]);
    expect(instance.handle.doc()?.transitions).toHaveLength(0);
    firstSettlement.resolve();

    const outputs = await Promise.all([
      placeExecution,
      transitionExecution,
      arcExecution,
      duplicatePlaceExecution,
    ]);
    expect(callbackOrder).toEqual(["addPlace", "addTransition", "addArc"]);
    expect(outputs).toEqual([
      expect.objectContaining({ applied: true }),
      expect.objectContaining({ applied: true }),
      expect.objectContaining({ applied: true }),
      expect.objectContaining({ applied: true }),
    ]);
    expect(instance.handle.doc()?.transitions[0]?.inputArcs).toEqual([
      { placeId: "queue", weight: 1, type: "standard" },
    ]);
    expect(settleRevision).toHaveBeenCalledTimes(3);
    const calls = [
      ["place-call", "addPlace", placeInput, outputs[0]],
      ["transition-call", "addTransition", transitionInput, outputs[1]],
      ["arc-call", "addArc", arcInput, outputs[2]],
    ] as const;
    for (const [
      toolCallId,
      toolName,
      canonicalInput,
      canonicalOutput,
    ] of calls) {
      const record = parseClientToolResultMetadata(
        adapter.clientToolResultMetadataFor(toolCallId),
      )?.canonicalMutationRecord;
      expect(record).toEqual(expect.objectContaining({ outcome: "applied" }));
      await expect(
        verifyCanonicalMutationRecord({
          record,
          toolCallId,
          toolName,
          canonicalInput,
          canonicalOutput,
          binding: {
            documentId: "document",
            incarnationId: "incarnation",
            conversationId: "conversation",
          },
        }),
      ).resolves.toEqual(expect.objectContaining({ outcome: "applied" }));
    }
  });

  test("continues later queued siblings after a late settlement failure", async () => {
    const { adapter, instance, params, settleRevision, tool } = setup();
    settleRevision
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("transition write refused"))
      .mockResolvedValueOnce(undefined);

    const independentPlaceInput = {
      ...placeInput,
      id: "independent",
      name: "Independent",
    };
    const [placeOutput, transitionOutput, independentOutput] =
      await Promise.all([
        tool("addPlace").execute(params(placeInput, undefined, "place-call")),
        tool("addTransition").execute(
          params(transitionInput, undefined, "transition-call"),
        ),
        tool("addPlace").execute(
          params(independentPlaceInput, undefined, "independent-call"),
        ),
      ]);

    expect(placeOutput).toEqual(expect.objectContaining({ applied: true }));
    expect(transitionOutput).toEqual({
      applied: false,
      reason: "The document revision was not settled: transition write refused",
    });
    expect(independentOutput).toEqual(
      expect.objectContaining({ applied: true }),
    );
    expect(instance.handle.doc()?.places.map(({ id }) => id)).toEqual([
      "queue",
      "independent",
    ]);
    expect(instance.handle.doc()?.transitions).toHaveLength(1);
    expect(adapter.metadataFor("place-call")).toEqual(
      expect.objectContaining({ outcome: "applied" }),
    );
    const failedTransition = adapter.metadataFor("transition-call");
    expect(failedTransition).toEqual(
      expect.objectContaining({ outcome: "unknown" }),
    );
    if (failedTransition?.toolName !== "addTransition")
      throw new Error("Missing transition metadata");
    expect(failedTransition.settlement.status).toBe("failed");
    expect(adapter.metadataFor("independent-call")).toEqual(
      expect.objectContaining({ outcome: "applied" }),
    );
  });

  test("returns a retained terminal result for a duplicate identity without re-executing", async () => {
    const { adapter, instance, params, settleRevision, tool } = setup();
    const addPlace = vi.spyOn(instance.mutations, "addPlace");
    const first = await tool("addPlace").execute(params(placeInput));
    const duplicate = await tool("addPlace").execute(params(placeInput));
    expect(duplicate).toEqual(first);
    expect(addPlace).toHaveBeenCalledOnce();
    expect(settleRevision).toHaveBeenCalledOnce();
    expect(instance.handle.doc()?.places).toHaveLength(1);

    const firstMetadata = adapter.clientToolResultMetadataFor("call-1");
    if (firstMetadata?.canonicalMutationRecord === undefined)
      throw new Error("Missing canonical mutation metadata");
    firstMetadata.canonicalMutationRecord.input = { mutated: true };
    expect(
      adapter.clientToolResultMetadataFor("call-1")?.canonicalMutationRecord
        ?.input,
    ).toEqual(placeInput);
  });

  test("derives and remounts read and I/A/B mutation terminals without observing or mutating again", async () => {
    const original = setup();
    const calls = [
      {
        toolCallId: "read-call",
        toolName: "getLatestNetDefinition",
        input: {},
        output: original
          .tool("getLatestNetDefinition")
          .execute(original.params({}, undefined, "read-call")),
      },
      {
        toolCallId: "place-call",
        toolName: "addPlace",
        input: placeInput,
        output: await original
          .tool("addPlace")
          .execute(original.params(placeInput, undefined, "place-call")),
      },
      {
        toolCallId: "transition-call",
        toolName: "addTransition",
        input: transitionInput,
        output: await original
          .tool("addTransition")
          .execute(
            original.params(transitionInput, undefined, "transition-call"),
          ),
      },
      {
        toolCallId: "arc-call",
        toolName: "addArc",
        input: arcInput,
        output: await original
          .tool("addArc")
          .execute(original.params(arcInput, undefined, "arc-call")),
      },
    ] as const;
    const messages = [
      {
        role: "assistant",
        purpose: "assistant",
        parts: calls.map((call) => ({
          type: "dynamic-tool",
          state: "output-available",
          ...call,
        })),
      },
      {
        role: "system",
        purpose: "dispatch",
        signal: { tagName: "client-tool-result" },
        parts: [
          {
            type: "text",
            text: JSON.stringify(
              calls.map((call) => ({
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: call.output,
                metadata: original.adapter.clientToolResultMetadataFor(
                  call.toolCallId,
                ),
              })),
            ),
          },
        ],
      },
    ];
    const replay = await deriveCanonicalPetrinautReplay({
      snapshot: { messages } as never,
      binding: {
        documentId: "document",
        incarnationId: "incarnation",
        conversationId: "conversation",
      },
    });
    expect([...replay.terminalReads]).toHaveLength(1);
    expect([...replay.terminalMutations]).toHaveLength(3);
    expect([...replay.blockedCalls]).toHaveLength(0);

    const remounted = setup({ status: "ready", replay });
    const addPlace = vi.spyOn(remounted.instance.mutations, "addPlace");
    const addTransition = vi.spyOn(
      remounted.instance.mutations,
      "addTransition",
    );
    const addArc = vi.spyOn(remounted.instance.mutations, "addArc");
    remounted.instance.handle.change((draft) => {
      draft.places.push({ ...placeInput, id: "live-only" });
    });

    expect(
      remounted
        .tool("getLatestNetDefinition")
        .execute(remounted.params({}, undefined, "read-call")),
    ).toEqual(calls[0].output);
    await expect(
      remounted
        .tool("addPlace")
        .execute(remounted.params(placeInput, undefined, "place-call")),
    ).resolves.toEqual(calls[1].output);
    await expect(
      remounted
        .tool("addTransition")
        .execute(
          remounted.params(transitionInput, undefined, "transition-call"),
        ),
    ).resolves.toEqual(calls[2].output);
    await expect(
      remounted
        .tool("addArc")
        .execute(remounted.params(arcInput, undefined, "arc-call")),
    ).resolves.toEqual(calls[3].output);
    expect(addPlace).not.toHaveBeenCalled();
    expect(addTransition).not.toHaveBeenCalled();
    expect(addArc).not.toHaveBeenCalled();
    expect(remounted.settleRevision).not.toHaveBeenCalled();
    expect(remounted.instance.handle.doc()?.places).toEqual([
      expect.objectContaining({ id: "live-only" }),
    ]);
    expect(remounted.adapter.clientToolResultMetadataFor("read-call")).toEqual(
      original.adapter.clientToolResultMetadataFor("read-call"),
    );
    expect(remounted.adapter.clientToolResultMetadataFor("arc-call")).toEqual(
      original.adapter.clientToolResultMetadataFor("arc-call"),
    );
  });

  test("blocks malformed, duplicate, missing, conflicting and mismatched history terminals", async () => {
    const original = setup();
    const output = await original
      .tool("addPlace")
      .execute(original.params(placeInput, undefined, "place-call"));
    const metadata = original.adapter.clientToolResultMetadataFor("place-call");
    const assistantCall = {
      type: "dynamic-tool",
      state: "output-available",
      toolCallId: "place-call",
      toolName: "addPlace",
      input: placeInput,
      output,
    };
    const result = {
      toolCallId: "place-call",
      toolName: "addPlace",
      output,
      metadata,
    };
    const derive = async (options?: {
      calls?: readonly unknown[];
      dispatchText?: string;
      results?: readonly unknown[];
    }) =>
      deriveCanonicalPetrinautReplay({
        snapshot: {
          messages: [
            {
              role: "assistant",
              purpose: "assistant",
              parts: options?.calls ?? [assistantCall],
            },
            {
              role: "system",
              purpose: "dispatch",
              signal: { tagName: "client-tool-result" },
              parts: [
                {
                  type: "text",
                  text:
                    options?.dispatchText ??
                    JSON.stringify(options?.results ?? [result]),
                },
              ],
            },
          ],
        } as never,
        binding: {
          documentId: "document",
          incarnationId: "incarnation",
          conversationId: "conversation",
        },
      });
    const mutationRecord = metadata?.canonicalMutationRecord;
    if (mutationRecord === undefined)
      throw new Error("Missing canonical mutation metadata");
    const cases = [
      { results: [result, structuredClone(result)] },
      { results: [{ ...result, metadata: undefined }] },
      { dispatchText: "not-json" },
      {
        results: [
          {
            ...result,
            metadata: {
              canonicalMutationRecord: {
                ...mutationRecord,
                binding: {
                  ...mutationRecord.binding,
                  incarnationId: "other-incarnation",
                },
              },
            },
          },
        ],
      },
      {
        calls: [
          {
            ...assistantCall,
            input: { ...placeInput, name: "Mismatched input" },
          },
        ],
      },
      { results: [{ ...result, output: { applied: false, reason: "wrong" } }] },
      {
        calls: [
          assistantCall,
          {
            ...assistantCall,
            toolName: "addTransition",
            input: transitionInput,
          },
        ],
      },
    ];
    for (const historyCase of cases) {
      const replay = await derive(historyCase);
      expect(replay.terminalMutations.has("place-call")).toBe(false);
      expect(replay.blockedCalls.has("place-call")).toBe(true);
    }
    const conflictingReplay = await derive({
      results: [result, structuredClone(result)],
    });
    const conflicting = setup({ status: "ready", replay: conflictingReplay });
    await expect(
      conflicting
        .tool("addPlace")
        .execute(conflicting.params(placeInput, undefined, "place-call")),
    ).rejects.toThrow("Conflicting duplicate canonical tool call");
    expect(
      conflicting.adapter.clientToolResultMetadataFor("place-call"),
    ).toBeUndefined();
    expect(conflicting.instance.handle.doc()?.places).toEqual([]);

    const read = setup();
    const readOutput = read
      .tool("getLatestNetDefinition")
      .execute(read.params({}, undefined, "read-call"));
    const readMetadata = read.adapter.clientToolResultMetadataFor("read-call");
    const readReplay = await deriveCanonicalPetrinautReplay({
      snapshot: {
        messages: [
          {
            role: "assistant",
            purpose: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                state: "output-available",
                toolCallId: "read-call",
                toolName: "getLatestNetDefinition",
                input: {},
                output: readOutput,
              },
            ],
          },
          {
            role: "system",
            purpose: "dispatch",
            signal: { tagName: "client-tool-result" },
            parts: [
              {
                type: "text",
                text: JSON.stringify([
                  {
                    toolCallId: "read-call",
                    toolName: "getLatestNetDefinition",
                    output: {
                      ...(readOutput as Record<string, unknown>),
                      definition: { places: [] },
                    },
                    metadata: readMetadata,
                  },
                ]),
              },
            ],
          },
        ],
      } as never,
      binding: {
        documentId: "document",
        incarnationId: "incarnation",
        conversationId: "conversation",
      },
    });
    expect(readReplay.terminalReads.has("read-call")).toBe(false);
    expect(readReplay.blockedCalls.has("read-call")).toBe(true);
  });

  test("fails closed while replay is unresolved and for admitted calls without one valid terminal", async () => {
    const pending = setup({ status: "pending" });
    expect(() =>
      pending
        .tool("getLatestNetDefinition")
        .execute(pending.params({}, undefined, "read-call")),
    ).toThrow(
      "Canonical tool replay verification is not ready for this conversation",
    );
    await expect(
      pending
        .tool("addPlace")
        .execute(pending.params(placeInput, undefined, "place-call")),
    ).resolves.toEqual({
      applied: false,
      reason:
        "Canonical tool replay verification is not ready for this conversation.",
    });
    expect(pending.instance.handle.doc()?.places).toEqual([]);

    const replay = await deriveCanonicalPetrinautReplay({
      snapshot: {
        messages: [
          {
            role: "assistant",
            purpose: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                state: "input-available",
                toolCallId: "read-call",
                toolName: "getLatestNetDefinition",
                input: {},
              },
              {
                type: "dynamic-tool",
                state: "input-available",
                toolCallId: "place-call",
                toolName: "addPlace",
                input: placeInput,
              },
            ],
          },
        ],
      } as never,
      binding: {
        documentId: "document",
        incarnationId: "incarnation",
        conversationId: "conversation",
      },
    });
    expect([...replay.blockedCalls.keys()].toSorted()).toEqual([
      "place-call",
      "read-call",
    ]);
    const remounted = setup({ status: "ready", replay });
    expect(() =>
      remounted
        .tool("getLatestNetDefinition")
        .execute(remounted.params({}, undefined, "read-call")),
    ).toThrow(
      "This canonical read call was previously admitted without one verifiable terminal result",
    );
    const failedOutput = await remounted
      .tool("addPlace")
      .execute(remounted.params(placeInput, undefined, "place-call"));
    expect(failedOutput).toEqual({
      applied: false,
      reason:
        "This canonical mutation call was previously admitted without one verifiable terminal result.",
    });
    const failedRecord = parseClientToolResultMetadata(
      remounted.adapter.clientToolResultMetadataFor("place-call"),
    )?.canonicalMutationRecord;
    const binding = {
      documentId: "document",
      incarnationId: "incarnation",
      conversationId: "conversation",
    };
    await expect(
      verifyCanonicalMutationRecord({
        record: failedRecord,
        toolCallId: "place-call",
        toolName: "addPlace",
        canonicalInput: placeInput,
        canonicalOutput: failedOutput,
        binding,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: "failed",
        effects: { created: [], updated: [], deleted: [], derived: [] },
        settlement: { status: "not-required" },
        diagnostics: { status: "not-required" },
      }),
    );
    const verifyMutationResults = await loadServerMutationVerifier();
    await expect(
      verifyMutationResults({
        body: JSON.stringify([
          {
            toolCallId: "place-call",
            toolName: "addPlace",
            output: failedOutput,
            metadata:
              remounted.adapter.clientToolResultMetadataFor("place-call"),
          },
        ]),
        snapshot: {
          messages: [
            {
              role: "assistant",
              purpose: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  state: "output-available",
                  toolCallId: "place-call",
                  toolName: "addPlace",
                  input: placeInput,
                  output: { awaiting: AWAITING_CLIENT },
                },
              ],
            },
          ],
        } as never,
        binding,
      }),
    ).resolves.toBeUndefined();
    await expect(
      remounted
        .tool("addTransition")
        .execute(remounted.params(transitionInput, undefined, "place-call")),
    ).rejects.toThrow("Conflicting duplicate canonical tool call");
    expect(remounted.instance.handle.doc()?.places).toEqual([]);
    expect(remounted.settleRevision).not.toHaveBeenCalled();

    const terminalReplay = await deriveCanonicalPetrinautReplay({
      snapshot: {
        messages: [
          {
            role: "assistant",
            purpose: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                state: "output-available",
                toolCallId: "place-call",
                toolName: "addPlace",
                input: placeInput,
                output: { disposition: "awaiting-client" },
              },
            ],
          },
          {
            role: "system",
            purpose: "dispatch",
            signal: { tagName: "client-tool-result" },
            parts: [
              {
                type: "text",
                text: JSON.stringify([
                  {
                    toolCallId: "place-call",
                    toolName: "addPlace",
                    output: failedOutput,
                    metadata:
                      remounted.adapter.clientToolResultMetadataFor(
                        "place-call",
                      ),
                  },
                ]),
              },
            ],
          },
        ],
      } as never,
      binding: {
        documentId: "document",
        incarnationId: "incarnation",
        conversationId: "conversation",
      },
    });
    expect(terminalReplay.terminalMutations.has("place-call")).toBe(true);
    const reloaded = setup({ status: "ready", replay: terminalReplay });
    const addPlace = vi.spyOn(reloaded.instance.mutations, "addPlace");
    await expect(
      reloaded
        .tool("addPlace")
        .execute(reloaded.params(placeInput, undefined, "place-call")),
    ).resolves.toEqual(failedOutput);
    expect(addPlace).not.toHaveBeenCalled();
    expect(reloaded.settleRevision).not.toHaveBeenCalled();
    expect(reloaded.instance.handle.doc()?.places).toEqual([]);
  });
});
