/** @vitest-environment jsdom */
import { describe, expect, test, vi } from "vitest";

import {
  parseClientToolResultMetadata,
  verifyCanonicalMutationRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { createCanonicalPetrinautHostTools } from "./brunch-petrinaut-tools";
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

const requireAddPlaceRecord = (
  record: BrowserToolRecord | undefined,
): BrowserAddPlaceRecord => {
  if (record?.toolName !== "addPlace")
    throw new Error("Missing addPlace metadata");
  return record;
};

const setup = () => {
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
});
