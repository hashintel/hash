/** @vitest-environment jsdom */
import { describe, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  createCanonicalPetrinautHostTools,
  issuedCanonicalCallsFromHistory,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
} from "./brunch-petrinaut-tools";

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
const place = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  targetSubnetId: null,
};
const binding = {
  documentId: "document",
  incarnationId: "incarnation",
  conversationId: "conversation",
};
const setup = (replay = EMPTY_CANONICAL_PETRINAUT_REPLAY) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      id: "document",
      initial: structuredClone(emptyNet),
      capabilities: { disabledExtensions: [] },
    }),
  });
  const settleRevision = vi.fn(async () => undefined);
  const adapter = createCanonicalPetrinautHostTools({
    handle: instance.handle,
    binding,
    readTitle: () => "Untitled",
    replayReadiness: { status: "ready", replay },
    settleRevision,
  });
  const tool = (name: string) => {
    const found = adapter.tools.find(
      (candidate) => candidate.toolName === name,
    );
    if (!found) throw new Error(`Missing ${name}`);
    return found;
  };
  const params = (
    rawInput: unknown,
    toolCallId: string,
  ): PetrinautAiAutomaticToolExecuteParams => ({
    input: rawInput,
    toolCallId,
    handle: instance.handle,
    mutations: instance.mutations,
    commands: instance.commands,
    readDiagnosticsContext: async () => "No diagnostics",
    viewport: { frameSceneAfterRender: async () => "framed" },
    signal: new AbortController().signal,
  });
  return { adapter, instance, settleRevision, tool, params };
};

describe("canonical browser revision attribution", () => {
  test("returns the canonical read unchanged with the revision it observed", async () => {
    const { adapter, instance, tool, params } = setup();
    const before = instance.handle.revisionId.get();
    const output = tool("getLatestNetDefinition").execute(params({}, "read"));
    expect(output).toMatchObject({ title: "Untitled", definition: emptyNet });
    expect(await adapter.clientToolResultMetadataFor("read", output)).toEqual({
      documentRevision: { before },
    });
  });
  test("settles an applied mutation once and leaves a no-op at its prior revision", async () => {
    const { adapter, instance, settleRevision, tool, params } = setup();
    const before = instance.handle.revisionId.get();
    adapter.mapClientToolInput({
      toolName: "addPlace",
      toolCallId: "create",
      input: place,
    });
    const applied = tool("addPlace").execute(params(place, "create"));
    expect(applied).not.toMatchObject({ applied: false });
    const after = instance.handle.revisionId.get();
    expect(after).not.toBe(before);
    expect(
      await adapter.clientToolResultMetadataFor("create", applied),
    ).toEqual({ documentRevision: { before, after } });
    expect(settleRevision).toHaveBeenCalledWith({
      documentId: "document",
      revisionId: after,
    });
    adapter.mapClientToolInput({
      toolName: "addPlace",
      toolCallId: "noop",
      input: place,
    });
    const noop = tool("addPlace").execute({
      ...params(place, "noop"),
      mutations: { ...instance.mutations, addPlace: () => undefined },
    });
    expect(noop).toMatchObject({ applied: false });
    expect(await adapter.clientToolResultMetadataFor("noop", noop)).toEqual({
      documentRevision: { before: after },
    });
    expect(settleRevision).toHaveBeenCalledOnce();
  });
  test("history blocks an uncertain write rather than retrying it", async () => {
    const snapshot = {
      messages: [
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "addPlace",
              toolCallId: "attempted",
              state: "input-available",
              input: place,
            },
          ],
        },
      ],
    } as never;
    const replay = await issuedCanonicalCallsFromHistory({ snapshot });
    const { instance, tool, params } = setup(replay);
    expect(() => tool("addPlace").execute(params(place, "attempted"))).toThrow(
      /already attempted/u,
    );
    expect(instance.handle.doc()?.places).toEqual([]);
  });
});
