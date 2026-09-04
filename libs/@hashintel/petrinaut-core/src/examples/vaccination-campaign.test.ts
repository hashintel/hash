import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir";
import { lowerScenarioToHir } from "../hir/scenario";
import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import {
  createMonteCarloExperiment,
  runExperimentToCompletion,
} from "../simulation/monte-carlo";
import { analyzeCompilation } from "../webgpu/compilation-report";
import { assessGpuEligibility } from "../webgpu/eligibility";
import { vaccinationCampaign } from "./vaccination-campaign";

import type { CompiledScenarioResult } from "../simulation/authoring/scenario/compile-scenario";

const { petriNetDefinition } = vaccinationCampaign;

const winterWave = petriNetDefinition.scenarios!.find(
  (scenario) => scenario.id === "scenario__winter_wave",
)!;
const totalCost = petriNetDefinition.metrics!.find(
  (metric) => metric.id === "metric__total_cost",
)!;
const infectedPlace = petriNetDefinition.places.find(
  (place) => place.name === "Infected",
)!;

const { artifacts } = compileHirArtifacts(petriNetDefinition, undefined, {
  includeHir: true,
});
const winterWaveHir = lowerScenarioToHir(winterWave);

/** The two levers the optimization stories range over. */
type Levers = { vaccination_coverage: number; contact_reduction: number };

const compile = (levers?: Levers): CompiledScenarioResult => {
  const outcome = compileScenario(
    winterWave,
    winterWaveHir,
    petriNetDefinition.parameters,
    petriNetDefinition.places,
    petriNetDefinition.types,
    levers ? { scenarioParameterValues: levers } : undefined,
  );
  if (!outcome.ok) {
    throw new Error(
      `scenario failed to compile: ${outcome.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
  return outcome.result;
};

/** Mean Total cost on the final state over eight seeded 60-day runs. */
const meanTotalCost = async (levers: Levers): Promise<number> => {
  const compiled = compile(levers);
  const runCount = 8;
  const handle = await createMonteCarloExperiment({
    sdcpn: petriNetDefinition,
    hirArtifacts: artifacts,
    initialMarking: compiled.initialState,
    parameterValues: compiled.parameterValues,
    seed: 1,
    dt: 0.1,
    maxTime: 60,
    runCount,
    runs: Array.from({ length: runCount }, (_, index) => ({
      seed: 1000 + index,
    })),
    metricSpecs: [
      {
        kind: "expression",
        id: totalCost.id,
        label: totalCost.name,
        sampleRuns: "all",
        code: totalCost.code,
        artifact: artifacts.metrics[totalCost.id]!,
      },
    ],
  });
  const completion = await runExperimentToCompletion(handle);
  if (completion.event.type !== "complete") {
    throw new Error(`experiment ended with ${completion.event.type}`);
  }
  let sum = 0;
  for (const result of completion.runResults.values()) {
    sum += result[totalCost.id]!;
  }
  return sum / completion.runResults.size;
};

describe("Vaccination Campaign", () => {
  it("is GPU-eligible as an uncoloured net", () => {
    const result = assessGpuEligibility(petriNetDefinition);

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.profile.uncolouredOnly).toBe(true);
    // Four counts, two firing counts, rng, status = 8 words.
    expect(result.profile.bytesPerRun).toBe(32);
  });

  it("compiles to a GPU shader with a place-count objective", () => {
    const report = analyzeCompilation({
      sdcpn: petriNetDefinition,
      artifacts,
      metricSpecs: [
        {
          id: "infected",
          label: "Infected",
          kind: "placeTokenCountMean",
          placeId: infectedPlace.id,
        },
      ],
    });

    expect(report.gpuReady).toBe(true);
    expect(report.eligibilityReasons).toStrictEqual([]);
    expect(report.shaderFailure).toBeNull();
    expect(report.metricFailure).toBeNull();
    expect(
      report.items
        .filter((item) => item.kind === "lambda")
        .map((item) => item.status),
    ).toStrictEqual(["gpu-ready", "gpu-ready"]);
  });

  it("seeds the Winter wave from the coverage and the initial cases", () => {
    const result = compile();

    expect(result.initialState).toEqual({
      place__susceptible: 686,
      place__infected: 20,
      place__recovered: 0,
      place__vaccinated: 294,
    });
    expect(Number(result.parameterValues.vaccination_coverage)).toBeCloseTo(
      0.3,
    );
    expect(Number(result.parameterValues.contact_reduction)).toBeCloseTo(0.2);
  });

  it("prices the cheapest response inside the levers' domain", async () => {
    const floor = await meanTotalCost({
      vaccination_coverage: 0.45,
      contact_reduction: 0.4,
    });
    const boundary: Levers[] = [
      { vaccination_coverage: 0, contact_reduction: 0 },
      { vaccination_coverage: 0, contact_reduction: 0.4 },
      { vaccination_coverage: 0, contact_reduction: 0.8 },
      { vaccination_coverage: 0.45, contact_reduction: 0 },
      { vaccination_coverage: 0.9, contact_reduction: 0 },
      { vaccination_coverage: 0.9, contact_reduction: 0.8 },
    ];

    for (const point of boundary) {
      expect(
        await meanTotalCost(point),
        `coverage ${point.vaccination_coverage}, contact reduction ${point.contact_reduction} costs more than the valley floor`,
      ).toBeGreaterThan(floor);
    }
  });
});
