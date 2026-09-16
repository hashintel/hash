/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import { petrinautDocsContent } from "@hashintel/petrinaut/ui";

import { brunchPetrinautDynamicToolNames } from "./brunch-client-tools";
import { createBrunchPetrinautTools } from "./brunch-petrinaut-tools";
import { observeBrowserDefinition } from "./mutation-record";

import type {
  PetrinautAiAutomaticToolExecuteParams,
  PetrinautAiViewportFrameResult,
} from "@hashintel/petrinaut/ui";

// The `/ui` entry pulls in chart code that probes `matchMedia` at import time.
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

const twoNodeNet: SDCPN = {
  places: [
    {
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "start",
      name: "Start",
      metadata: {},
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const instanceFor = (initial: SDCPN) =>
  createPetrinaut({
    document: createJsonDocHandle({
      id: "brunch-tools",
      initial: structuredClone(initial),
      capabilities: { disabledExtensions: ["subnets"] },
    }),
  });

const paramsFor = (
  instance: ReturnType<typeof createPetrinaut>,
  input: unknown,
  readDiagnosticsContext = async () => "No current TypeScript diagnostics.",
  frameSceneAfterRender: () => Promise<PetrinautAiViewportFrameResult> = async () =>
    "framed",
): PetrinautAiAutomaticToolExecuteParams => ({
  input,
  mutations: instance.mutations,
  commands: instance.commands,
  handle: instance.handle,
  readDiagnosticsContext,
  viewport: {
    frameSceneAfterRender,
  },
  toolCallId: "call-1",
  signal: new AbortController().signal,
});

const toolNamed = (
  tools: ReturnType<typeof createBrunchPetrinautTools>,
  toolName: string,
) => {
  const tool = tools.find((candidate) => candidate.toolName === toolName);
  if (!tool) throw new Error(`Missing ${toolName}`);
  return tool;
};

describe("Brunch-named Petrinaut tools", () => {
  test("mounts every Brunch-named tool as a dynamic host tool", () => {
    const tools = createBrunchPetrinautTools({
      readTitle: () => "Net",
      mutation: {
        binding: {
          conversationId: "c",
          documentId: "brunch-tools",
          incarnationId: "i",
        },
      },
    });
    expect(tools.map(({ toolName }) => toolName).toSorted()).toEqual(
      [...brunchPetrinautDynamicToolNames].toSorted(),
    );
    expect(toolNamed(tools, "layout_petrinaut_net").visibility).toBe("hidden");
    expect(
      createBrunchPetrinautTools({ readTitle: () => "Net" }).some(
        ({ toolName }) => toolName === "mutate_petrinaut_net",
      ),
    ).toBe(false);
  });

  test("serves the same user-guide page as the stock documentation read", () => {
    const instance = instanceFor(twoNodeNet);
    const tools = createBrunchPetrinautTools({ readTitle: () => "Net" });
    expect(
      toolNamed(tools, "read_petrinaut_docs").execute(
        paramsFor(instance, { doc: "drawing-a-net" }),
      ),
    ).toBe(petrinautDocsContent["drawing-a-net"]);
    expect(() =>
      toolNamed(tools, "read_petrinaut_docs").execute(
        paramsFor(instance, { doc: "not-a-page" }),
      ),
    ).toThrow();
  });

  test("reads title, the independently observed definition and resolved extensions", () => {
    const instance = instanceFor(twoNodeNet);
    const tools = createBrunchPetrinautTools({
      readTitle: () => "Inventory purchasing",
    });
    expect(
      toolNamed(tools, "read_petrinaut_net").execute(paramsFor(instance, {})),
    ).toEqual({
      title: "Inventory purchasing",
      definition: observeBrowserDefinition(instance.handle).definition,
      extensions: {
        colors: true,
        stochasticity: true,
        dynamics: true,
        parameters: true,
        subnets: false,
      },
      observation: {
        toolCallId: "call-1",
        sha256: observeBrowserDefinition(instance.handle).sha256,
      },
    });
  });

  test("answers the diagnostics read from the editor's diagnostics", async () => {
    const instance = instanceFor(twoNodeNet);
    const tools = createBrunchPetrinautTools({ readTitle: () => "Net" });
    await expect(
      toolNamed(tools, "read_petrinaut_diagnostics").execute(
        paramsFor(instance, {}, async () => "2 errors"),
      ),
    ).resolves.toBe("2 errors");
  });

  test("lays the net out immediately and says so when asked to confirm first", async () => {
    const instance = instanceFor(twoNodeNet);
    const tools = createBrunchPetrinautTools({ readTitle: () => "Net" });
    const output = (await toolNamed(tools, "layout_petrinaut_net").execute(
      paramsFor(instance, { askUserFirst: true }),
    )) as { applied: boolean; commitCount: number; detail?: string };
    expect(output.applied).toBe(true);
    expect(output.commitCount).toBeGreaterThan(0);
    expect(output.detail).toMatch(/without confirmation/u);
    expect(output.detail).toContain("Viewport frame: framed.");
    expect(
      instance.definition.get().transitions[0]?.x !== 0 ||
        instance.definition.get().transitions[0]?.y !== 0,
    ).toBe(true);
  });

  test("reports a bounded frame timeout with the canonical timed-out result", async () => {
    const instance = instanceFor(twoNodeNet);
    const tools = createBrunchPetrinautTools({ readTitle: () => "Net" });
    const output = (await toolNamed(tools, "layout_petrinaut_net").execute(
      paramsFor(
        instance,
        { askUserFirst: false },
        undefined,
        async () => "timed-out",
      ),
    )) as { detail?: string };

    expect(output.detail).toBe("Viewport frame: timed-out.");
  });

  test("returns a document-changing result only after the host settles its revision", async () => {
    const instance = instanceFor(twoNodeNet);
    const settled = Promise.withResolvers<void>();
    const order: string[] = [];
    const settleDocumentRevision = vi.fn(() => {
      order.push("settle");
      return settled.promise;
    });
    const tools = createBrunchPetrinautTools({
      readTitle: () => "Net",
      settleDocumentRevision,
    });
    const revisionBefore = instance.handle.revisionId.get();

    let output: unknown;
    const run = Promise.resolve(
      toolNamed(tools, "layout_petrinaut_net").execute(
        paramsFor(instance, { askUserFirst: false }, undefined, async () => {
          order.push("frame");
          return "framed";
        }),
      ),
    ).then((value) => {
      output = value;
    });
    await vi.waitFor(() =>
      expect(settleDocumentRevision).toHaveBeenCalledWith(
        instance.handle.revisionId.get(),
      ),
    );
    expect(instance.handle.revisionId.get()).not.toBe(revisionBefore);
    expect(order).toEqual(["frame", "settle"]);
    await Promise.resolve();
    expect(output).toBeUndefined();
    settled.resolve();
    await run;
    expect(output).toEqual(expect.objectContaining({ applied: true }));
  });

  test("shows a saved scenario and metric in the next net read after the batch that saved them", async () => {
    const instance = instanceFor(twoNodeNet);
    const tools = createBrunchPetrinautTools({
      readTitle: () => "Support desk",
      mutation: {
        binding: {
          conversationId: "c",
          documentId: "brunch-tools",
          incarnationId: "i",
        },
      },
    });
    const readNet = toolNamed(tools, "read_petrinaut_net");
    const before = readNet.execute(paramsFor(instance, {})) as {
      definition: SDCPN;
      observation: { sha256: string };
    };
    expect(before.definition.scenarios).toBeUndefined();
    expect(before.definition.metrics).toBeUndefined();

    const basis = {
      basisId: "basis-1",
      basis: { kind: "absent" as const, reason: "Loopback tracer" },
    };
    const output = (await toolNamed(tools, "mutate_petrinaut_net").execute(
      paramsFor(instance, {
        observation: {
          toolCallId: "call-1",
          baseHash: before.observation.sha256,
        },
        bases: [basis],
        operations: [
          {
            basisId: basis.basisId,
            operationId: "add-peak",
            type: "addScenario",
            input: {
              id: "peak-demand",
              name: "Peak demand",
              scenarioParameters: [
                { identifier: "active_agents", type: "integer", default: 4 },
              ],
              initialState: {
                type: "per_place",
                content: { queue: "scenario.active_agents" },
              },
            },
          },
          {
            basisId: basis.basisId,
            operationId: "add-wait",
            type: "addMetric",
            input: {
              id: "average-wait",
              name: "Average waiting time",
              code: "return state.places.Queue.count;",
            },
          },
        ],
      }),
    )) as { outcomes: { status: string }[] };
    expect(output.outcomes.map(({ status }) => status)).toEqual([
      "applied",
      "applied",
    ]);

    const after = readNet.execute(paramsFor(instance, {})) as {
      definition: SDCPN;
      observation: { sha256: string };
    };
    expect(after.observation.sha256).not.toBe(before.observation.sha256);
    expect(after.definition.scenarios).toEqual([
      expect.objectContaining({
        id: "peak-demand",
        name: "Peak demand",
        scenarioParameters: [
          { identifier: "active_agents", type: "integer", default: 4 },
        ],
      }),
    ]);
    expect(after.definition.metrics).toEqual([
      expect.objectContaining({
        id: "average-wait",
        name: "Average waiting time",
      }),
    ]);
    instance.dispose();
  });

  test("does not wait on the host for a tool that left the document unchanged", async () => {
    const instance = instanceFor(twoNodeNet);
    const settleDocumentRevision = vi.fn(() => new Promise<void>(() => {}));
    const tools = createBrunchPetrinautTools({
      readTitle: () => "Net",
      settleDocumentRevision,
    });
    await expect(
      toolNamed(tools, "read_petrinaut_net").execute(paramsFor(instance, {})),
    ).resolves.toEqual(expect.objectContaining({ title: "Net" }));
    expect(settleDocumentRevision).not.toHaveBeenCalled();
  });
});
