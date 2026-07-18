import { describe, expect, it, vi } from "vitest";

import { handleProtocolLine } from "./protocol";
import { parseServerRunRequest } from "./run-request";

import type { PetrinautCompiledModel } from "@hashintel/petrinaut-core/compiled-model";

const metadata: PetrinautCompiledModel["metadata"] = {
  parameters: [
    {
      id: "rate-id",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
      valueRange: null,
    },
    {
      id: "count-id",
      name: "Count",
      variableName: "count",
      type: "integer",
      defaultValue: "1",
      valueRange: null,
    },
    {
      id: "enabled-id",
      name: "Enabled",
      variableName: "enabled",
      type: "boolean",
      defaultValue: "false",
      valueRange: null,
    },
  ],
  places: [
    { id: "plain", name: "Plain", index: 0, color: null },
    {
      id: "colored",
      name: "Colored",
      index: 1,
      color: {
        id: "color",
        name: "Color",
        elements: [
          {
            elementId: "value-id",
            name: "value",
            type: "real",
            valueRange: null,
          },
        ],
      },
    },
  ],
  metrics: [
    {
      id: "metric-id",
      name: "Metric",
      optimizationObjective: null,
    },
  ],
};

function createModel(modelMetadata = metadata) {
  const runMock = vi.fn(() => ({
    seed: 42,
    status: "complete" as const,
    completionReason: "maxSteps" as const,
    frameCount: 2,
    finalTime: 1,
    finalPlaceTokenCounts: { plain: 2, colored: 1 },
    metrics: { Metric: 1 },
  }));
  return {
    metadata: modelMetadata,
    run: runMock,
    runMock,
  };
}

function send(model: PetrinautCompiledModel, request: unknown): unknown {
  const responses: unknown[] = [];
  handleProtocolLine(model, JSON.stringify(request), (response) => {
    responses.push(response);
  });
  expect(responses).toHaveLength(1);
  return responses[0];
}

describe("handleProtocolLine", () => {
  it("handles healthz and metadata requests", () => {
    const model = createModel();

    expect(send(model, { id: 1, method: "healthz" })).toEqual({
      id: 1,
      result: { ok: true },
    });
    expect(send(model, { id: 2, method: "metadata" })).toEqual({
      id: 2,
      result: metadata,
    });
  });

  it("normalizes a representative run request", () => {
    const model = createModel();

    expect(
      send(model, {
        id: "run-1",
        method: "run",
        params: {
          parameters: { rate: 1.5, count: 3, enabled: true },
          initialState: {
            Plain: 2,
            Colored: [{ value: 4 }],
          },
          metrics: ["Metric"],
          maxSteps: 1,
          dt: 0.25,
          seed: 42,
        },
      }),
    ).toMatchObject({ id: "run-1", result: { seed: 42 } });
    expect(model.runMock).toHaveBeenCalledWith({
      parameterValues: { rate: "1.5", count: "3", enabled: "true" },
      initialMarking: { plain: 2, colored: [{ value: 4 }] },
      metrics: ["metric-id"],
      maxSteps: 1,
      dt: 0.25,
      seed: 42,
    });
  });

  it("constructs scenario parameter records without prototype mutation", () => {
    const request = parseServerRunRequest(
      JSON.parse(
        '{"scenario":{"id":"scenario","parameterValues":{"__proto__":1}},"maxSteps":0}',
      ),
    );

    expect(request.scenario?.parameterValues).toHaveProperty("__proto__", 1);
    expect(Object.getPrototypeOf(request.scenario?.parameterValues)).toBe(
      Object.prototype,
    );
  });

  it("returns metric values under the requested stable id", () => {
    const model = createModel();

    expect(
      send(model, {
        id: 4,
        method: "run",
        params: { metrics: ["metric-id"], maxSteps: 0 },
      }),
    ).toMatchObject({
      id: 4,
      result: { metrics: { "metric-id": 1 } },
    });
    expect(model.runMock).toHaveBeenCalledWith(
      expect.objectContaining({ metrics: ["metric-id"] }),
    );
  });

  it("prioritizes exact ids and uses last-wins name aliases", () => {
    const model = createModel({
      ...metadata,
      parameters: [
        {
          id: "exact-parameter",
          name: "Shared parameter",
          variableName: "first_parameter",
          type: "real",
          defaultValue: "1",
          valueRange: null,
        },
        {
          id: "later-parameter",
          name: "exact-parameter",
          variableName: "later_parameter",
          type: "real",
          defaultValue: "1",
          valueRange: null,
        },
        {
          id: "last-parameter",
          name: "Shared parameter",
          variableName: "last_parameter",
          type: "real",
          defaultValue: "1",
          valueRange: null,
        },
      ],
      places: [
        { id: "first-place", name: "Shared place", index: 0, color: null },
        { id: "exact-place", name: "Other place", index: 1, color: null },
        { id: "last-place", name: "Shared place", index: 2, color: null },
        { id: "other-place", name: "exact-place", index: 3, color: null },
      ],
    });

    expect(
      send(model, {
        id: 3,
        method: "run",
        params: {
          parameters: {
            "exact-parameter": 2,
            "Shared parameter": 3,
          },
          initialState: {
            "exact-place": 4,
            "Shared place": 5,
          },
          maxSteps: 0,
        },
      }),
    ).toMatchObject({ id: 3, result: { seed: 42 } });
    expect(model.runMock).toHaveBeenCalledWith({
      parameterValues: { first_parameter: "2", last_parameter: "3" },
      initialMarking: { "exact-place": 4, "last-place": 5 },
      metrics: [],
      maxSteps: 0,
    });
  });

  it.each([
    [{}, "Run config requires either maxTime or maxSteps"],
    [{ maxTime: null }, "Run config requires either maxTime or maxSteps"],
    [{ parameters: [] }, "parameters must be an object"],
    [{ initialState: "invalid" }, "initialState must be an object"],
    [
      { scenario: { id: "scenario", parameterValues: {} }, parameters: {} },
      "scenario cannot be combined with parameters or initialState",
    ],
    [{ metrics: ["Metric", 1] }, "metrics must be an array of strings"],
    [{ seed: "42" }, "seed must be a finite number"],
    [{ dt: "0.1" }, "dt must be a finite number"],
    [{ maxSteps: 1.5 }, "maxSteps must be a non-negative integer"],
  ])("rejects invalid run field %#", (params, message) => {
    const response = send(createModel(), { id: 7, method: "run", params });

    expect(response).toEqual({ id: 7, error: { message } });
  });

  it("rejects markings incompatible with a place's color", () => {
    expect(
      send(createModel(), {
        id: 8,
        method: "run",
        params: { initialState: { Colored: 1 }, maxSteps: 1 },
      }),
    ).toEqual({
      id: 8,
      error: {
        message:
          'Initial marking for colored place "Colored" must be a token array',
      },
    });

    expect(
      send(createModel(), {
        id: 9,
        method: "run",
        params: { initialState: { Plain: [{}] }, maxSteps: 1 },
      }),
    ).toEqual({
      id: 9,
      error: {
        message:
          'Initial marking for uncolored place "Plain" must be a non-negative integer',
      },
    });
  });

  it("rejects uncolored token counts that overflow engine storage", () => {
    expect(
      send(createModel(), {
        id: 10,
        method: "run",
        params: { initialState: { Plain: 4_294_967_296 }, maxSteps: 1 },
      }),
    ).toEqual({
      id: 10,
      error: {
        message:
          'Initial marking for uncolored place "Plain" must not exceed 4294967295',
      },
    });
  });

  it("preserves request ids on protocol errors", () => {
    expect(send(createModel(), { id: "bad", method: "unknown" })).toEqual({
      id: "bad",
      error: { message: 'Unknown method "unknown"' },
    });
  });
});
