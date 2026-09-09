import { describe, expect, test, vi } from "vitest";

import { type ConstructionMutationRequest } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  createBrowserTransitionRecorder,
  observeBrowserDefinition,
} from "./transition-record";

const setup = () => {
  const handle = createJsonDocHandle({
    id: "test-document",
    initial: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
    capabilities: { disabledExtensions: [] },
  });
  const instance = createPetrinaut({ document: handle });
  const binding = {
    documentId: handle.id,
    incarnationId: "test-incarnation",
    conversationId: "test-conversation",
  };
  const request = (
    toolName: ConstructionMutationRequest["toolName"],
    input: ConstructionMutationRequest["input"],
  ): ConstructionMutationRequest => ({
    toolName,
    input,
    toolCallId: "test-call",
    binding,
    observationToolCallId: "test-read",
    requestedBaseHash: observeBrowserDefinition(handle).sha256,
  });
  return { handle, instance, binding, request };
};

describe("typed browser execution projection", () => {
  test("retains omitted raw scenario overrides while comparing canonical parsed callback input", () => {
    const fixture = setup();
    const raw = {
      id: "test-scenario",
      name: "TestScenario",
      scenarioParameters: [],
      initialState: { type: "per_place" as const, content: {} },
    };
    const request = fixture.request("addScenario", raw);
    const recorder = createBrowserTransitionRecorder({
      handle: fixture.handle,
      binding: fixture.binding,
      requestFor: () => request,
    });
    const parsed = petrinautAiTools.addScenario.inputSchema.parse(raw);
    const execute = vi.fn(() => {
      fixture.instance.mutations.addScenario(parsed);
      return { applied: true as const, title: "Added scenario" };
    });
    expect(
      recorder.executeMutation({
        toolCallId: request.toolCallId,
        toolName: "addScenario",
        input: parsed,
        execute,
      }),
    ).toEqual({ applied: true, title: "Added scenario" });
    expect(execute).toHaveBeenCalledTimes(1);
    const attempt = recorder.records()[0]!.attempts[0]!;
    expect(attempt.request.input).not.toHaveProperty("parameterOverrides");
    expect(attempt.post?.definition.scenarios?.[0]?.parameterOverrides).toEqual(
      {},
    );
    expect(attempt.effects.derived).toContainEqual({
      kind: "created",
      path: "/scenarios/0/parameterOverrides",
      after: {},
    });
    fixture.instance.dispose();
  });
  test("native default comparison does not accept changed callback fields", () => {
    const fixture = setup();
    const raw = {
      id: "test-scenario",
      name: "TestScenario",
      scenarioParameters: [],
      initialState: { type: "per_place" as const, content: {} },
    };
    const request = fixture.request("addScenario", raw);
    const recorder = createBrowserTransitionRecorder({
      handle: fixture.handle,
      binding: fixture.binding,
      requestFor: () => request,
    });
    const execute = vi.fn(() => ({
      applied: true as const,
      title: "Unexecuted",
    }));
    expect(() =>
      recorder.executeMutation({
        toolCallId: request.toolCallId,
        toolName: "addScenario",
        input: {
          ...petrinautAiTools.addScenario.inputSchema.parse(raw),
          name: "Forged",
        },
        execute,
      }),
    ).toThrow(/canonical tool call/);
    expect(execute).not.toHaveBeenCalled();
    expect(recorder.records()).toEqual([]);
    fixture.instance.dispose();
  });
  test("unearned generated arc footprint refuses before execution, without silently mutating", () => {
    const fixture = setup();
    fixture.instance.mutations.addType({
      id: "test-type",
      name: "TestType",
      iconSlug: "circle",
      displayColor: "#0088ff",
      elements: [{ elementId: "test-value", name: "value", type: "integer" }],
    });
    fixture.instance.mutations.addPlace({
      id: "test-place",
      name: "TestPlace",
      colorId: "test-type",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    fixture.instance.mutations.addTransition({
      id: "test-transition",
      name: "Test transition",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "",
      x: 100,
      y: 0,
    });
    const input = {
      transitionId: "test-transition",
      placeId: "test-place",
      arcDirection: "output" as const,
      weight: 1,
    };
    const request = fixture.request("addArc", input);
    const recorder = createBrowserTransitionRecorder({
      handle: fixture.handle,
      binding: fixture.binding,
      requestFor: () => request,
    });
    const execute = vi.fn(() => {
      fixture.instance.mutations.addArc(input);
      return { applied: true as const, title: "Added arc" };
    });
    expect(() =>
      recorder.executeMutation({
        toolCallId: request.toolCallId,
        toolName: "addArc",
        input,
        execute,
      }),
    ).toThrow(/Derived arc footprints are unavailable/);
    expect(execute).not.toHaveBeenCalled();
    expect(observeBrowserDefinition(fixture.handle).sha256).toBe(
      request.requestedBaseHash,
    );
    expect(recorder.records()[0]?.outcome).toBe("failed");
    fixture.instance.dispose();
  });
});
