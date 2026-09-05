import { describe, expect, test } from "vitest";

import {
  createPreviewSimulationCompiler,
  resolvePreviewPlaybackOptions,
  validatePreviewQuickSimulation,
} from "./quick-simulation";

import type { HirArtifacts, ScenarioHir } from "@hashintel/petrinaut-core";

const hirArtifacts: HirArtifacts = {
  version: 4,
  fingerprint: "0123456789abcdef",
  dynamics: {},
  lambdas: {},
  kernels: {},
  metrics: {},
};

const scenarioHir: ScenarioHir = {
  version: 1,
  parameterOverrides: {},
  placeExpressions: {},
};

describe("Preview Quick Simulation compiler", () => {
  test("returns the supplied immutable net and scenario artifacts", async () => {
    const compiler = createPreviewSimulationCompiler({
      hirArtifacts,
      scenarioHirById: { scenario: scenarioHir },
    });

    await expect(compiler.requestHirArtifacts({} as never)).resolves.toEqual({
      artifacts: hirArtifacts,
      failures: [],
    });
    await expect(
      compiler.requestScenarioHir(
        {
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        },
        undefined,
        "scenario",
      ),
    ).resolves.toBe(scenarioHir);
  });

  test("rejects missing and unknown named-scenario artifacts", async () => {
    const compiler = createPreviewSimulationCompiler({
      hirArtifacts,
      scenarioHirById: {},
    });
    const input = {
      parameterOverrides: {},
      initialState: { type: "per_place" as const, content: {} },
    };

    await expect(compiler.requestScenarioHir(input)).rejects.toThrow(
      "requires a named scenario",
    );
    await expect(
      compiler.requestScenarioHir(input, undefined, "missing"),
    ).rejects.toThrow('No precompiled scenario HIR is available for "missing"');
  });
});

describe("Preview Quick Simulation playback options", () => {
  test("defaults to the first host-allowed speed", () => {
    expect(
      resolvePreviewPlaybackOptions({ allowedPlaybackSpeeds: [5, 10] }),
    ).toEqual({
      allowedPlaybackSpeeds: [5, 10],
      defaultPlaybackSpeed: 5,
    });
  });

  test("honors an allowed explicit default", () => {
    expect(
      resolvePreviewPlaybackOptions({
        allowedPlaybackSpeeds: [2, 5, 10],
        defaultPlaybackSpeed: 10,
      }).defaultPlaybackSpeed,
    ).toBe(10);
  });

  test("rejects empty options and disallowed defaults", () => {
    expect(() =>
      resolvePreviewPlaybackOptions({ allowedPlaybackSpeeds: [] }),
    ).toThrow("at least one allowed playback speed");
    expect(() =>
      resolvePreviewPlaybackOptions({
        allowedPlaybackSpeeds: [1, 2],
        defaultPlaybackSpeed: 5,
      }),
    ).toThrow("default playback speed (5) must be allowed");
  });
});

describe("Preview Quick Simulation model validation", () => {
  test("requires at least one named scenario", () => {
    expect(() =>
      validatePreviewQuickSimulation(
        { scenarios: [] },
        { scenarioHirById: {} },
      ),
    ).toThrow("requires at least one named scenario");
  });

  test("requires precompiled HIR for every declared scenario", () => {
    const declaredScenarios = [
      { id: "covered" },
      { id: "missing" },
    ] as NonNullable<
      Parameters<typeof validatePreviewQuickSimulation>[0]["scenarios"]
    >;

    expect(() =>
      validatePreviewQuickSimulation(
        { scenarios: declaredScenarios },
        { scenarioHirById: { covered: scenarioHir } },
      ),
    ).toThrow("missing precompiled HIR for: missing");
  });
});
