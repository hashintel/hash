/** @vitest-environment jsdom */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, test, vi } from "vitest";

import {
  applyPetrinautConstructionOutputSchema,
  applyPetrinautConstructionToolName,
  parseClientToolResultMetadata,
  verifyDeepConstructionRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createJsonDocHandle,
  createPetrinaut,
  type DocumentRevisionId,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  createApplyPetrinautConstructionHostTool,
  deriveDeepConstructionReplay,
  type DeepConstructionReplay,
} from "./mutate-petrinet-tool";

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
const binding = {
  documentId: "document",
  incarnationId: "incarnation",
  conversationId: "conversation",
};
const markdown = "# Ledger\n\nBuild a queue and serve it.";
const ledger = {
  revisionId: "ledger-1",
  sha256: bytesToHex(sha256(new TextEncoder().encode(markdown))),
  ordinal: 1,
  markdown,
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
const operation = (
  operationId: string,
  toolName: "addPlace" | "addTransition" | "addArc",
  input: typeof placeInput | typeof transitionInput | typeof arcInput,
) => ({
  operationId,
  toolName,
  input,
  intendedEffect: `Apply ${toolName}`,
  intendedTarget: operationId,
  expectedImpact: [operationId],
  evidence: {
    excerpts: ["Build a queue and serve it."],
    rationale: "The settled Ledger asks for this structure.",
  },
});
const threeSteps = {
  operations: [
    operation("queue", "addPlace", placeInput),
    operation("serve", "addTransition", transitionInput),
    operation("wire", "addArc", arcInput),
  ],
};

const verifyRecord = async (
  adapter: ReturnType<typeof createApplyPetrinautConstructionHostTool>,
  canonicalInput: unknown,
  canonicalOutput: unknown,
  toolCallId = "call-1",
) => {
  const metadata = parseClientToolResultMetadata(
    adapter.clientToolResultMetadataFor(toolCallId),
  );
  expect(metadata?.deepConstructionRecord).toBeDefined();
  return verifyDeepConstructionRecord({
    record: metadata?.deepConstructionRecord,
    toolCallId,
    canonicalInput,
    canonicalOutput,
    binding,
    ledgerRevision: ledger,
  });
};

const setup = (
  replay: DeepConstructionReplay = {
    terminalRecords: new Map(),
    blockedToolCallIds: new Set(),
  },
  replayReady = true,
) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      id: "document",
      initial: structuredClone(emptyNet),
      capabilities: { disabledExtensions: [] },
    }),
  });
  const settleRevision = vi.fn(
    async (_input: {
      readonly documentId: string;
      readonly revisionId: DocumentRevisionId;
    }) => undefined,
  );
  const adapter = createApplyPetrinautConstructionHostTool({
    handle: instance.handle,
    binding,
    initialLedger: ledger,
    replayReadiness: replayReady
      ? { status: "ready", replay }
      : { status: "pending" },
    settleRevision,
  });
  const map = (input: unknown) =>
    adapter.mapClientToolInput({
      input,
      toolName: applyPetrinautConstructionToolName,
      toolCallId: "call-1",
    });
  const params = (
    input: unknown,
    overrides: Partial<PetrinautAiAutomaticToolExecuteParams> = {},
  ): PetrinautAiAutomaticToolExecuteParams => ({
    input,
    mutations: instance.mutations,
    commands: instance.commands,
    handle: instance.handle,
    readDiagnosticsContext: async () => "No current TypeScript diagnostics.",
    viewport: { frameSceneAfterRender: async () => "framed" },
    toolCallId: "call-1",
    signal: new AbortController().signal,
    ...overrides,
  });
  return {
    adapter,
    instance,
    map,
    params,
    settleRevision,
    setBinding: (next: typeof binding) => {
      adapter.updateAuthority({ binding: next, ledger });
    },
    setLedger: (next: typeof ledger) => {
      adapter.updateAuthority({ binding, ledger: next });
    },
  };
};

describe("bounded Interface B browser execution", () => {
  test("executes addPlace → addTransition → addArc and settles each exact revision", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    const output = await adapter.tool.execute(params(map(threeSteps)));

    expect(output).toEqual(
      expect.objectContaining({
        disposition: "complete",
        outcomes: [
          expect.objectContaining({ status: "applied", toolName: "addPlace" }),
          expect.objectContaining({
            status: "applied",
            toolName: "addTransition",
          }),
          expect.objectContaining({ status: "applied", toolName: "addArc" }),
        ],
      }),
    );
    expect(instance.handle.doc()?.transitions[0]?.inputArcs).toEqual([
      { placeId: "queue", weight: 1, type: "standard" },
    ]);
    expect(settleRevision).toHaveBeenCalledTimes(3);
    expect(applyPetrinautConstructionOutputSchema.parse(output)).toEqual(
      output,
    );
    const retained = adapter.recordFor("call-1");
    expect(retained?.binding).toEqual(binding);
    expect(retained?.authority.status).toBe("verified");
    if (retained?.authority.status !== "verified")
      throw new Error("expected verified authority");
    expect(retained.authority.ledger).toEqual({
      revisionId: ledger.revisionId,
      sha256: ledger.sha256,
      ordinal: ledger.ordinal,
    });
    expect(
      adapter.clientToolResultMetadataFor("call-1")?.deepConstructionRecord,
    ).toEqual(retained);
    const verified = await verifyRecord(adapter, threeSteps, output);
    expect(verified.toolCallId).toBe("call-1");
    expect(verified.attempts).toHaveLength(3);
    expect(verified.attempts[0]?.record.output).toBeDefined();
    expect(JSON.stringify(adapter.recordFor("call-1"))).not.toContain(markdown);
  });

  test("retains an honest no-op in the successful prefix", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    const input = {
      operations: [
        operation("queue-first", "addPlace", placeInput),
        operation("queue-again", "addPlace", placeInput),
        operation("serve", "addTransition", transitionInput),
      ],
    };
    const addPlace = instance.mutations.addPlace.bind(instance.mutations);
    let addPlaceCalls = 0;
    vi.spyOn(instance.mutations, "addPlace").mockImplementation(
      (mutationInput) => {
        addPlaceCalls += 1;
        if (addPlaceCalls === 1) addPlace(mutationInput);
      },
    );
    const output = await adapter.tool.execute(params(map(input)));
    expect(output).toEqual(
      expect.objectContaining({
        disposition: "complete",
        outcomes: [
          expect.objectContaining({ status: "applied" }),
          expect.objectContaining({ status: "no-op", effects: [] }),
          expect.objectContaining({ status: "applied" }),
        ],
      }),
    );
    expect(settleRevision).toHaveBeenCalledTimes(2);
    const verified = await verifyRecord(adapter, input, output);
    expect(verified.attempts).toHaveLength(3);
  });

  test("keeps an applied prefix durable and leaves a late invalid suffix unattempted", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    const input = {
      operations: [
        operation("queue", "addPlace", placeInput),
        operation("missing-wire", "addArc", {
          ...arcInput,
          transitionId: "missing",
        }),
        operation("later-wire", "addArc", arcInput),
      ],
    };
    const output = await adapter.tool.execute(params(map(input)));
    expect(output).toEqual(
      expect.objectContaining({
        disposition: "partial",
        outcomes: [
          expect.objectContaining({ status: "applied" }),
          expect.objectContaining({ status: "failed" }),
          expect.objectContaining({ status: "unattempted" }),
        ],
      }),
    );
    expect(instance.handle.doc()?.places).toHaveLength(1);
    expect(settleRevision).toHaveBeenCalledOnce();
    const verified = await verifyRecord(adapter, input, output);
    expect(verified.attempts).toHaveLength(2);
  });

  test("refuses before mutation when a hand edit changes the mapped live base", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    const mapped = map(threeSteps);
    instance.mutations.addPlace({
      ...placeInput,
      id: "hand",
      name: "HandEdit",
    });

    const output = await adapter.tool.execute(params(mapped));
    expect(output).toEqual(
      expect.objectContaining({
        disposition: "refused",
        reason:
          "The bound document, settled Ledger, or projected live base changed before execution.",
        outcomes: threeSteps.operations.map((step, index) =>
          expect.objectContaining({
            index,
            operationId: step.operationId,
            status: "unattempted",
          }),
        ),
      }),
    );
    expect(instance.handle.doc()?.places.map(({ id }) => id)).toEqual(["hand"]);
    expect(settleRevision).not.toHaveBeenCalled();
    const verified = await verifyRecord(adapter, threeSteps, output);
    expect(verified.authority.status).toBe("refused");
    expect(verified.attempts).toEqual([]);
  });

  test("rejects tampered deep metadata at the shared boundary", async () => {
    const { adapter, map, params } = setup();
    const output = await adapter.tool.execute(params(map(threeSteps)));
    const record = structuredClone(adapter.recordFor("call-1"));
    if (record?.authority.status !== "verified")
      throw new Error("expected verified authority");
    record.authority.ledger.sha256 = "0".repeat(64);
    await expect(
      verifyDeepConstructionRecord({
        record,
        toolCallId: "call-1",
        canonicalInput: threeSteps,
        canonicalOutput: output,
        binding,
        ledgerRevision: ledger,
      }),
    ).rejects.toThrow();
  });

  test("refuses an admitted call while replay verification is pending, even after a ready host replaces it", async () => {
    const pending = setup(undefined, false);
    const input = { operations: [threeSteps.operations[0]] };
    const admittedBeforeVerification = pending.map(input);

    const ready = setup();
    await ready.adapter.tool.execute(ready.params(ready.map(input)));
    const output = await pending.adapter.tool.execute(
      pending.params(admittedBeforeVerification),
    );

    expect(applyPetrinautConstructionOutputSchema.parse(output)).toEqual(
      expect.objectContaining({
        disposition: "refused",
        reason:
          "Deep construction replay verification is not ready for this conversation.",
        outcomes: [expect.objectContaining({ status: "unattempted" })],
      }),
    );
    expect(pending.instance.handle.doc()?.places).toEqual([]);
    expect(pending.settleRevision).not.toHaveBeenCalled();
    expect(ready.instance.handle.doc()?.places).toHaveLength(1);
  });

  test("returns a parsed refusal when current Ledger enrichment is unavailable", async () => {
    const { adapter, map, params, settleRevision } = setup();
    adapter.updateAuthority({ binding, ledger: undefined });
    const output = await adapter.tool.execute(params(map(threeSteps)));
    expect(output).toEqual(
      expect.objectContaining({
        disposition: "refused",
        reason: "A current settled Ledger revision is required.",
        outcomes: threeSteps.operations.map(() =>
          expect.objectContaining({ status: "unattempted" }),
        ),
      }),
    );
    expect(settleRevision).not.toHaveBeenCalled();
  });

  test("refuses changed binding or Ledger authority before mutation", async () => {
    const { adapter, map, params, setBinding, setLedger } = setup();
    const mapped = map(threeSteps);
    setBinding({ ...binding, incarnationId: "replacement" });
    setLedger({ ...ledger, revisionId: "ledger-2" });
    await expect(adapter.tool.execute(params(mapped))).resolves.toEqual(
      expect.objectContaining({ disposition: "refused" }),
    );
  });

  test("authorizes a copied browser input by issued identity without publishing host authority", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    const input = { operations: [threeSteps.operations[0]] };
    const published = map(input);
    const copied = structuredClone(published);
    const output = await adapter.tool.execute(params(copied));
    expect(output).toMatchObject({
      disposition: "complete",
      outcomes: [{ operationId: "queue", status: "applied" }],
    });
    expect(published).not.toHaveProperty("authority");
    expect(instance.handle.doc()?.places.map(({ id }) => id)).toEqual([
      "queue",
    ]);
    expect(settleRevision).toHaveBeenCalledOnce();
    await verifyRecord(adapter, input, output);

    await expect(
      adapter.tool.execute(params(structuredClone(published))),
    ).resolves.toEqual(output);
    expect(settleRevision).toHaveBeenCalledOnce();
  });

  test("rejects forged, unmapped, altered and conflicting duplicate deep inputs", async () => {
    const { adapter, instance, map, settleRevision } = setup();
    const input = { operations: [threeSteps.operations[0]] };
    const forged = { toolCallId: "call-1", modelInput: input };
    expect(() => adapter.tool.inputSchema.parse(forged)).toThrow(
      "The deep construction call lacks host authority.",
    );
    const published = map(input);
    if (typeof published !== "object" || published === null)
      throw new Error("The host did not publish a deep input.");
    expect(() =>
      adapter.tool.inputSchema.parse({
        ...structuredClone(published),
        modelInput: { operations: [threeSteps.operations[1]] },
      }),
    ).toThrow("The deep construction call lacks host authority.");
    expect(() =>
      adapter.tool.inputSchema.parse({
        ...structuredClone(published),
        authorizationToken: "forged",
      }),
    ).toThrow("The deep construction call lacks host authority.");
    expect(() =>
      adapter.tool.inputSchema.parse({
        ...structuredClone(published),
        toolCallId: "another-call",
      }),
    ).toThrow("The deep construction call lacks host authority.");
    expect(() =>
      adapter.tool.inputSchema.parse({
        ...structuredClone(published),
        authority: { status: "verified" },
      }),
    ).toThrow("The deep construction call lacks host authority.");
    expect(() =>
      adapter.mapClientToolInput({
        input: { operations: [threeSteps.operations[1]] },
        toolName: applyPetrinautConstructionToolName,
        toolCallId: "call-1",
      }),
    ).toThrow("Conflicting duplicate deep construction call.");
    expect(instance.handle.doc()?.places).toEqual([]);
    expect(settleRevision).not.toHaveBeenCalled();
  });

  test("does not reapply a retained duplicate identity", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    const mapped = map({ operations: [threeSteps.operations[0]] });
    const first = await adapter.tool.execute(params(mapped));
    const second = await adapter.tool.execute(params(mapped));
    expect(second).toEqual(first);
    expect(instance.handle.doc()?.places).toHaveLength(1);
    expect(settleRevision).toHaveBeenCalledOnce();
  });

  test("replays a verified terminal history result without mutating a remounted host", async () => {
    const first = setup();
    const input = { operations: [threeSteps.operations[0]] };
    const output = await first.adapter.tool.execute(
      first.params(first.map(input)),
    );
    const metadata = first.adapter.clientToolResultMetadataFor("call-1");
    const messages = [
      {
        role: "assistant",
        purpose: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "mutate_workpiece",
            toolCallId: ledger.revisionId,
            state: "output-available",
            input: { markdown },
            output: {
              revisionId: ledger.revisionId,
              sha256: ledger.sha256,
              ordinal: ledger.ordinal,
            },
          },
          {
            type: "dynamic-tool",
            toolName: applyPetrinautConstructionToolName,
            toolCallId: "call-1",
            state: "output-available",
            input,
            output,
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
                toolName: applyPetrinautConstructionToolName,
                output,
                metadata,
              },
            ]),
          },
        ],
      },
    ];
    const replay = await deriveDeepConstructionReplay({
      snapshot: { messages } as never,
      binding,
    });
    expect(replay.terminalRecords.has("call-1")).toBe(true);
    const conflictingDuplicateReplay = await deriveDeepConstructionReplay({
      snapshot: { messages: [...messages, messages[1]] } as never,
      binding,
    });
    expect(conflictingDuplicateReplay.terminalRecords.has("call-1")).toBe(
      false,
    );
    expect(conflictingDuplicateReplay.blockedToolCallIds.has("call-1")).toBe(
      true,
    );

    const remounted = setup(replay);
    await expect(
      remounted.adapter.tool.execute(remounted.params(remounted.map(input))),
    ).resolves.toEqual(output);
    expect(remounted.instance.handle.doc()?.places).toEqual([]);
    expect(remounted.settleRevision).not.toHaveBeenCalled();
  });

  test("blocks an admitted history call without one verifiable terminal result", async () => {
    const input = { operations: [threeSteps.operations[0]] };
    const replay = await deriveDeepConstructionReplay({
      snapshot: {
        messages: [
          {
            role: "assistant",
            purpose: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: applyPetrinautConstructionToolName,
                toolCallId: "call-1",
                state: "input-available",
                input,
              },
            ],
          },
        ],
      } as never,
      binding,
    });
    expect(replay.blockedToolCallIds.has("call-1")).toBe(true);
    const remounted = setup(replay);
    const output = await remounted.adapter.tool.execute(
      remounted.params(remounted.map(input)),
    );
    expect(output).toEqual(expect.objectContaining({ disposition: "refused" }));
    expect(remounted.instance.handle.doc()?.places).toEqual([]);
    expect(remounted.settleRevision).not.toHaveBeenCalled();
  });

  test("settles a changed post revision when the canonical callback throws and records settlement failure", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    const addPlace = instance.mutations.addPlace.bind(instance.mutations);
    vi.spyOn(instance.mutations, "addPlace").mockImplementation(
      (mutationInput) => {
        addPlace(mutationInput);
        throw new Error("callback failed after change");
      },
    );
    settleRevision.mockRejectedValueOnce(new Error("post write refused"));

    const output = applyPetrinautConstructionOutputSchema.parse(
      await adapter.tool.execute(
        params(map({ operations: [threeSteps.operations[0]] })),
      ),
    );

    expect(settleRevision).toHaveBeenCalledOnce();
    const settlement = settleRevision.mock.calls[0]?.[0];
    expect(settlement?.documentId).toBe("document");
    expect(typeof settlement?.revisionId).toBe("string");
    expect(output.outcomes[0]).toEqual({
      index: 0,
      operationId: "queue",
      toolName: "addPlace",
      status: "unknown",
      error:
        "callback failed after change; the changed revision was not settled: post write refused",
    });
    expect(instance.handle.doc()?.places).toHaveLength(1);
  });

  test("reports persistence refusal as unknown and stops", async () => {
    const { adapter, instance, map, params, settleRevision } = setup();
    settleRevision.mockRejectedValueOnce(new Error("write refused"));
    const output = applyPetrinautConstructionOutputSchema.parse(
      await adapter.tool.execute(params(map(threeSteps))),
    );
    expect(output.disposition).toBe("partial");
    expect(output.outcomes.map(({ status }) => status)).toEqual([
      "unknown",
      "unattempted",
      "unattempted",
    ]);
    expect(output.outcomes[0]).toEqual(
      expect.objectContaining({
        error: "The document revision was not settled: write refused",
      }),
    );
    expect(instance.handle.doc()?.places).toHaveLength(1);
  });

  test("reads diagnostics once after a multi-step prefix and shares the result only with relevant sidecars", async () => {
    const batch = setup();
    const readDiagnosticsContext = vi.fn(
      async () => "No current TypeScript diagnostics.",
    );
    const codedBatch = {
      operations: [
        operation("queue", "addPlace", placeInput),
        operation("serve", "addTransition", {
          ...transitionInput,
          lambdaCode: "return true;",
        }),
        operation("wire", "addArc", arcInput),
      ],
    };
    const output = applyPetrinautConstructionOutputSchema.parse(
      await batch.adapter.tool.execute(
        batch.params(batch.map(codedBatch), { readDiagnosticsContext }),
      ),
    );
    expect(output.diagnostics).toEqual({
      disposition: "settled",
      diagnostics: ["No current TypeScript diagnostics."],
    });
    expect(readDiagnosticsContext).toHaveBeenCalledOnce();
    const record = batch.adapter.recordFor("call-1");
    expect(record?.attempts).toHaveLength(3);
    for (const [index, attempt] of (record?.attempts ?? []).entries()) {
      if (
        typeof attempt !== "object" ||
        attempt === null ||
        !("diagnostics" in attempt)
      )
        throw new Error("expected canonical attempt");
      expect(attempt.diagnostics).toEqual(
        index === 0
          ? { status: "not-required" }
          : {
              status: "settled",
              value: "No current TypeScript diagnostics.",
            },
      );
    }
  });

  test("keeps diagnostics pending and failed dispositions honest and never lays out before they settle", async () => {
    const coded = {
      operations: [
        operation("coded", "addTransition", {
          ...transitionInput,
          lambdaCode: "return true;",
        }),
      ],
      layout: { requested: true as const },
    };

    const pending = setup();
    const pendingLayout = vi.spyOn(
      pending.instance.commands,
      "applyAutoLayout",
    );
    const pendingOutput = await pending.adapter.tool.execute(
      pending.params(pending.map(coded), {
        readDiagnosticsContext: async () =>
          "The model changed while diagnostics were running; check again before relying on compilation results.",
      }),
    );
    expect(pendingOutput).toEqual(
      expect.objectContaining({
        diagnostics: { disposition: "pending" },
        layout: {
          requested: true,
          disposition: "failed",
          error:
            "Layout was not applied because diagnostics are still pending.",
        },
      }),
    );
    expect(pendingLayout).not.toHaveBeenCalled();

    const failed = setup();
    const failedLayout = vi.spyOn(failed.instance.commands, "applyAutoLayout");
    const failedOutput = await failed.adapter.tool.execute(
      failed.params(failed.map(coded), {
        readDiagnosticsContext: async () => {
          throw new Error("worker unavailable");
        },
      }),
    );
    expect(failedOutput).toEqual(
      expect.objectContaining({
        diagnostics: { disposition: "failed", error: "worker unavailable" },
        layout: {
          requested: true,
          disposition: "failed",
          error:
            "Layout was not applied because diagnostics failed: worker unavailable",
        },
      }),
    );
    expect(failedLayout).not.toHaveBeenCalled();
  });

  test("requires confirmation instead of automatically laying out an already arranged base", async () => {
    const { adapter, instance, map, params } = setup();
    instance.mutations.addPlace({
      ...placeInput,
      id: "existing",
      name: "Existing",
    });
    const applyLayout = vi.spyOn(instance.commands, "applyAutoLayout");
    const input = {
      operations: [
        operation("new-place", "addPlace", {
          ...placeInput,
          id: "new-place",
          name: "NewPlace",
        }),
      ],
      layout: { requested: true as const },
    };

    const output = applyPetrinautConstructionOutputSchema.parse(
      await adapter.tool.execute(params(map(input))),
    );

    expect(output.layout).toEqual({
      requested: true,
      disposition: "confirmation-required",
    });
    expect(applyLayout).not.toHaveBeenCalled();
    expect(adapter.recordFor("call-1")?.layout).toBeUndefined();
  });

  test("records and verifies applied layout observations, position effects, hashes and settlement", async () => {
    const relevant = setup();
    const frame = vi.fn(async () => "framed" as const);
    vi.spyOn(relevant.instance.commands, "applyAutoLayout").mockImplementation(
      async () => {
        relevant.instance.mutations.updatePlacePosition({
          placeId: "queue",
          position: { x: 40, y: 60 },
          targetSubnetId: null,
        });
        return { commitCount: 1 };
      },
    );
    const input = {
      operations: [threeSteps.operations[0]],
      layout: { requested: true as const },
    };
    const output = await relevant.adapter.tool.execute(
      relevant.params(relevant.map(input), {
        viewport: { frameSceneAfterRender: frame },
      }),
    );
    const parsedOutput = applyPetrinautConstructionOutputSchema.parse(output);
    expect(parsedOutput.layout).toEqual({
      requested: true,
      disposition: "applied",
      preHash: relevant.adapter.recordFor("call-1")?.layout?.pre.sha256,
      postHash: relevant.adapter.recordFor("call-1")?.layout?.post.sha256,
    });
    expect(relevant.adapter.recordFor("call-1")?.layout?.effects).toEqual([
      { path: "/places/0/x", kind: "updated", before: 0, after: 40 },
      { path: "/places/0/y", kind: "updated", before: 0, after: 60 },
    ]);
    expect(
      relevant.adapter.recordFor("call-1")?.layout?.settlement.status,
    ).toBe("settled");
    expect(relevant.settleRevision).toHaveBeenCalledTimes(2);
    expect(frame).toHaveBeenCalledOnce();
    const verified = await verifyRecord(relevant.adapter, input, output);
    expect(verified.layout).toBeDefined();
  });

  test("records and verifies an applied layout attempt that changes no positions", async () => {
    const attempted = setup();
    vi.spyOn(attempted.instance.commands, "applyAutoLayout").mockResolvedValue({
      commitCount: 0,
    });
    const input = {
      operations: [threeSteps.operations[0]],
      layout: { requested: true as const },
    };
    const output = applyPetrinautConstructionOutputSchema.parse(
      await attempted.adapter.tool.execute(
        attempted.params(attempted.map(input)),
      ),
    );
    expect(output.layout).toEqual(
      expect.objectContaining({
        requested: true,
        disposition: "applied",
        preHash: attempted.adapter.recordFor("call-1")?.layout?.pre.sha256,
        postHash: attempted.adapter.recordFor("call-1")?.layout?.post.sha256,
      }),
    );
    expect(attempted.adapter.recordFor("call-1")?.layout?.effects).toEqual([]);
    expect(attempted.settleRevision).toHaveBeenCalledTimes(2);
    const verified = await verifyRecord(attempted.adapter, input, output);
    expect(verified.layout).toBeDefined();
  });

  test("shared verification rejects tampered layout effects and output hashes", async () => {
    const applied = setup();
    vi.spyOn(applied.instance.commands, "applyAutoLayout").mockImplementation(
      async () => {
        applied.instance.mutations.updatePlacePosition({
          placeId: "queue",
          position: { x: 40, y: 60 },
          targetSubnetId: null,
        });
        return { commitCount: 1 };
      },
    );
    const input = {
      operations: [threeSteps.operations[0]],
      layout: { requested: true as const },
    };
    const output = applyPetrinautConstructionOutputSchema.parse(
      await applied.adapter.tool.execute(applied.params(applied.map(input))),
    );
    const effectsTampered = structuredClone(
      applied.adapter.recordFor("call-1"),
    );
    if (effectsTampered?.layout === undefined)
      throw new Error("expected layout evidence");
    effectsTampered.layout.effects = [];
    await expect(
      verifyDeepConstructionRecord({
        record: effectsTampered,
        toolCallId: "call-1",
        canonicalInput: input,
        canonicalOutput: output,
        binding,
        ledgerRevision: ledger,
      }),
    ).rejects.toThrow("layout effects");

    const originalRecord = structuredClone(applied.adapter.recordFor("call-1"));
    if (
      originalRecord?.layout === undefined ||
      output.layout.disposition !== "applied"
    )
      throw new Error("expected applied layout evidence");
    const outputTampered = {
      ...output,
      layout: { ...output.layout, postHash: "0".repeat(64) },
    };
    const hashesTampered = { ...originalRecord, output: outputTampered };
    await expect(
      verifyDeepConstructionRecord({
        record: hashesTampered,
        toolCallId: "call-1",
        canonicalInput: input,
        canonicalOutput: outputTampered,
        binding,
        ledgerRevision: ledger,
      }),
    ).rejects.toThrow("layout hashes");
  });

  test("records and verifies changed state when layout throws without calling it applied", async () => {
    const failed = setup();
    vi.spyOn(failed.instance.commands, "applyAutoLayout").mockImplementation(
      async () => {
        failed.instance.mutations.updatePlacePosition({
          placeId: "queue",
          position: { x: 40, y: 60 },
          targetSubnetId: null,
        });
        throw new Error("layout worker failed after change");
      },
    );
    const input = {
      operations: [threeSteps.operations[0]],
      layout: { requested: true as const },
    };
    const output = applyPetrinautConstructionOutputSchema.parse(
      await failed.adapter.tool.execute(failed.params(failed.map(input))),
    );
    expect(output.layout).toEqual({
      requested: true,
      disposition: "failed",
      error: "layout worker failed after change",
      preHash: failed.adapter.recordFor("call-1")?.layout?.pre.sha256,
      postHash: failed.adapter.recordFor("call-1")?.layout?.post.sha256,
    });
    expect(failed.instance.handle.doc()?.places[0]).toEqual(
      expect.objectContaining({ x: 40, y: 60 }),
    );
    expect(failed.settleRevision).toHaveBeenCalledTimes(2);
    const verified = await verifyRecord(failed.adapter, input, output);
    expect(verified.layout).toBeDefined();
  });

  test("records and verifies changed layout state when exact revision settlement fails", async () => {
    const failed = setup();
    failed.settleRevision
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("layout write refused"));
    vi.spyOn(failed.instance.commands, "applyAutoLayout").mockImplementation(
      async () => {
        failed.instance.mutations.updatePlacePosition({
          placeId: "queue",
          position: { x: 40, y: 60 },
          targetSubnetId: null,
        });
        return { commitCount: 1 };
      },
    );
    const input = {
      operations: [threeSteps.operations[0]],
      layout: { requested: true as const },
    };
    const output = applyPetrinautConstructionOutputSchema.parse(
      await failed.adapter.tool.execute(failed.params(failed.map(input))),
    );
    const expectedError =
      "The layout revision was not settled: layout write refused";
    expect(output.layout).toEqual({
      requested: true,
      disposition: "failed",
      error: expectedError,
      preHash: failed.adapter.recordFor("call-1")?.layout?.pre.sha256,
      postHash: failed.adapter.recordFor("call-1")?.layout?.post.sha256,
    });
    expect(failed.adapter.recordFor("call-1")?.layout?.settlement).toEqual({
      status: "failed",
      revisionId: failed.adapter.recordFor("call-1")?.layout?.post.revisionId,
      error: expectedError,
    });
    expect(output.finalObservation).toEqual({
      disposition: "observed",
      documentRevision:
        failed.adapter.recordFor("call-1")?.layout?.post.revisionId,
      definitionHash: failed.adapter.recordFor("call-1")?.layout?.post.sha256,
    });
    const verified = await verifyRecord(failed.adapter, input, output);
    expect(verified.layout?.settlement.status).toBe("failed");

    const originalRecord = failed.adapter.recordFor("call-1");
    if (
      originalRecord?.layout?.settlement.status !== "failed" ||
      output.layout.disposition !== "failed" ||
      output.layout.preHash === undefined ||
      output.layout.postHash === undefined
    )
      throw new Error("expected failed layout settlement evidence");
    const contradictoryOutput = {
      ...output,
      layout: {
        requested: true as const,
        disposition: "applied" as const,
        preHash: output.layout.preHash,
        postHash: output.layout.postHash,
      },
    };
    await expect(
      verifyDeepConstructionRecord({
        record: { ...originalRecord, output: contradictoryOutput },
        toolCallId: "call-1",
        canonicalInput: input,
        canonicalOutput: contradictoryOutput,
        binding,
        ledgerRevision: ledger,
      }),
    ).rejects.toThrow("settlement or failure");
  });

  test("omits layout evidence and hashes when layout fails without changing state", async () => {
    const failed = setup();
    vi.spyOn(failed.instance.commands, "applyAutoLayout").mockRejectedValue(
      new Error("layout worker unavailable"),
    );
    const input = {
      operations: [threeSteps.operations[0]],
      layout: { requested: true as const },
    };
    const output = applyPetrinautConstructionOutputSchema.parse(
      await failed.adapter.tool.execute(failed.params(failed.map(input))),
    );
    expect(output.layout).toEqual({
      requested: true,
      disposition: "failed",
      error: "layout worker unavailable",
    });
    expect(failed.adapter.recordFor("call-1")?.layout).toBeUndefined();
    expect(failed.settleRevision).toHaveBeenCalledOnce();
    const verified = await verifyRecord(failed.adapter, input, output);
    expect(verified.layout).toBeUndefined();
  });

  test("omits layout evidence when layout is irrelevant", async () => {
    const irrelevant = setup();
    const noOpInput = { operations: [threeSteps.operations[0]] };
    await irrelevant.adapter.tool.execute(
      irrelevant.params(irrelevant.map(noOpInput)),
    );
    vi.spyOn(irrelevant.instance.mutations, "addPlace").mockImplementation(
      () => undefined,
    );
    const secondInput = irrelevant.adapter.mapClientToolInput({
      input: { ...noOpInput, layout: { requested: true } },
      toolName: applyPetrinautConstructionToolName,
      toolCallId: "call-2",
    });
    const second = await irrelevant.adapter.tool.execute(
      irrelevant.params(secondInput, { toolCallId: "call-2" }),
    );
    expect(second).toEqual(
      expect.objectContaining({
        layout: { requested: true, disposition: "not-relevant" },
      }),
    );
    expect(irrelevant.adapter.recordFor("call-2")?.layout).toBeUndefined();
  });
});
