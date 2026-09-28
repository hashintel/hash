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
import { documentRevisionOf } from "./shared/document-revision";

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
const setup = (replay = EMPTY_CANONICAL_PETRINAUT_REPLAY) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      id: "document",
      initial: structuredClone(emptyNet),
      capabilities: { disabledExtensions: [] },
    }),
  });
  const adapter = createCanonicalPetrinautHostTools({
    handle: instance.handle,
    readTitle: () => "Untitled",
    replayReadiness: { status: "ready", replay },
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
  const revision = () => {
    const definition = instance.handle.doc();
    if (!definition) throw new Error("The test document is unavailable.");
    return documentRevisionOf(definition);
  };
  return { adapter, instance, tool, params, revision };
};

describe("canonical browser revision attribution", () => {
  test("returns the canonical read unchanged with the revision it observed", () => {
    const { adapter, tool, params } = setup();
    const output = tool("getLatestNetDefinition").execute(params({}, "read"));
    expect(output).toMatchObject({ title: "Untitled", definition: emptyNet });
    expect(adapter.clientToolResultMetadataFor("read", output)).toEqual({
      documentRevision: { before: documentRevisionOf(emptyNet) },
    });
  });
  test("stamps an applied mutation with its new revision and leaves a no-op at its prior revision", () => {
    const { adapter, instance, tool, params, revision } = setup();
    const before = revision();
    adapter.mapClientToolInput({
      toolName: "addPlace",
      toolCallId: "create",
      input: place,
    });
    const applied = tool("addPlace").execute(params(place, "create"));
    expect(applied).not.toMatchObject({ applied: false });
    const after = revision();
    expect(after).not.toBe(before);
    expect(adapter.clientToolResultMetadataFor("create", applied)).toEqual({
      documentRevision: { before, after },
      readBack: {
        ...emptyNet,
        places: [
          {
            id: "queue",
            name: "Queue",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
          },
        ],
      },
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
    expect(adapter.clientToolResultMetadataFor("noop", noop)).toEqual({
      documentRevision: { before: after },
    });
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
  test("history returns a recorded diagnostics result rather than reading live diagnostics", async () => {
    const snapshot = {
      messages: [
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "getNetCompilationErrors",
              toolCallId: "diagnosed",
              state: "output-available",
              input: {},
              output: {
                brunchBrowserResult: true,
                output: "Recorded diagnostics",
              },
            },
          ],
        },
      ],
    } as never;
    const replay = await issuedCanonicalCallsFromHistory({ snapshot });
    const { tool, params } = setup(replay);
    const readDiagnosticsContext = vi.fn(async () => "Live diagnostics");
    expect(
      await tool("getNetCompilationErrors").execute({
        ...params({}, "diagnosed"),
        readDiagnosticsContext,
      }),
    ).toBe("Recorded diagnostics");
    expect(readDiagnosticsContext).not.toHaveBeenCalled();
  });
});

describe("net freshness", () => {
  test("the readers return filtered views and record the revision they observed", () => {
    const { adapter, instance, tool, params, revision } = setup();
    instance.mutations.addPlace(place);
    const before = revision();
    const outline = tool("readNetOutline").execute(params({}, "outline"));
    expect(outline).toMatchObject({
      title: "Untitled",
      definition: { places: [expect.not.objectContaining({ x: 0 })] },
    });
    expect(adapter.clientToolResultMetadataFor("outline", outline)).toEqual({
      documentRevision: { before },
    });
    expect(() =>
      tool("readNetStructure").inputSchema.parse({ extra: 1 }),
    ).toThrow();
  });

  test("a change is accepted after the model's revision only through Brunch's own settled changes", () => {
    const { adapter, instance, tool, params, revision } = setup();
    const seen = revision();
    expect(adapter.acceptsRevision(seen)).toBe(true);
    adapter.mapClientToolInput({
      toolName: "addPlace",
      toolCallId: "create",
      input: place,
    });
    const applied = tool("addPlace").execute(params(place, "create"));
    adapter.clientToolResultMetadataFor("create", applied);
    // A later call in the same proposal still names the revision the model saw.
    expect(adapter.acceptsRevision(seen)).toBe(true);
    instance.mutations.addPlace({ ...place, id: "hand", name: "Hand" });
    expect(adapter.acceptsRevision(seen)).toBe(false);
    expect(adapter.acceptsRevision(revision())).toBe(true);
  });

  test("the chain survives a reload through the settled revisions in history", () => {
    const replay = {
      calls: new Map([
        [
          "create",
          {
            toolName: "addPlace",
            input: place,
            output: {},
            metadata: {
              documentRevision: {
                before: "r-seen",
                after: documentRevisionOf(emptyNet),
              },
            },
          },
        ],
      ]),
    };
    const { adapter } = setup(replay);
    expect(adapter.acceptsRevision("r-seen")).toBe(true);
    expect(adapter.acceptsRevision("r-other")).toBe(false);
  });
});
