import { describe, expect, it } from "vitest";

import {
  type HirInterpretBindings,
  prepareScenarioCompiler,
} from "@hashintel/petrinaut-core";
import { lowerScenarioToHir } from "@hashintel/petrinaut-core/hir";

import {
  sirConstrainedOptimizationInput,
  sirNetConstrainedOptimizationInput,
  sirOptimizationInput,
  sirOverridingOptimizationScenario,
} from "../../sir-optimization-input.fixtures";
import {
  hasParameterConstraints,
  parameterConstraintOutcome,
} from "./parameter-constraints";

import type { PetrinautOptimizationManifest } from "@hashintel/petrinaut-core/optimization";

/** The bindings the channel evaluates at: the net values resolved through the study's scenario at the trial's values. */
const bindingsAt = (
  manifest: PetrinautOptimizationManifest,
  scenario: Readonly<Record<string, number>>,
): HirInterpretBindings => {
  const studyScenario = manifest.model.definition.scenarios?.find(
    (candidate) => candidate.id === manifest.scenario.id,
  );
  if (!studyScenario) {
    throw new Error("The study's scenario is missing");
  }
  const compiled = prepareScenarioCompiler(
    studyScenario,
    lowerScenarioToHir(studyScenario),
    manifest.model.definition.parameters,
  ).compileParameterNumbers(scenario);
  if (!compiled.ok) {
    throw new Error(compiled.errors[0]?.message ?? "scenario");
  }
  return { parameters: compiled.parameters, scenario };
};

describe("hasParameterConstraints", () => {
  it("is true only for a study with a parameter constraint", () => {
    expect(hasParameterConstraints(sirOptimizationInput)).toBe(false);
    expect(hasParameterConstraints(sirConstrainedOptimizationInput)).toBe(true);
    expect(
      hasParameterConstraints({
        constraints: sirConstrainedOptimizationInput.constraints?.filter(
          (constraint) => constraint.space === "state",
        ),
      }),
    ).toBe(false);
  });
});

describe("parameterConstraintOutcome", () => {
  it("is null for a study without parameter constraints", () => {
    expect(
      parameterConstraintOutcome(
        sirOptimizationInput,
        bindingsAt(sirOptimizationInput, {
          population: 1_000,
          infected_ratio: 0.05,
        }),
      ),
    ).toBeNull();
  });

  it("reports each margin and names the first constraint a draw breaks", () => {
    const feasible = parameterConstraintOutcome(
      sirConstrainedOptimizationInput,
      bindingsAt(sirConstrainedOptimizationInput, {
        population: 1_000,
        infected_ratio: 0.05,
      }),
    );
    expect(feasible).toMatchObject({
      results: [{ constraintId: "ratio-cap" }],
      infeasible: null,
    });
    expect(feasible?.results[0]?.margin).toBeCloseTo(0.05);

    const infeasible = parameterConstraintOutcome(
      sirConstrainedOptimizationInput,
      bindingsAt(sirConstrainedOptimizationInput, {
        population: 1_000,
        infected_ratio: 0.15,
      }),
    );
    expect(infeasible).toMatchObject({
      results: [{ constraintId: "ratio-cap" }],
      infeasible: "ratio-cap",
    });
    expect(infeasible?.results[0]?.margin).toBeCloseTo(-0.05);
  });

  it("reads a net parameter at the value the scenario's override resolves it to at the trial's values", () => {
    expect(sirOverridingOptimizationScenario.parameterOverrides).toMatchObject({
      param__infection_rate: "scenario.infected_ratio * 20",
    });

    // 0.05 * 20 = 1: under the cap, although the net's default of 3 is not.
    const feasible = parameterConstraintOutcome(
      sirNetConstrainedOptimizationInput,
      bindingsAt(sirNetConstrainedOptimizationInput, {
        population: 1_000,
        infected_ratio: 0.05,
      }),
    );
    expect(feasible).toMatchObject({
      results: [{ constraintId: "rate-cap" }],
      infeasible: null,
    });
    expect(feasible?.results[0]?.margin).toBeCloseTo(1);

    // 0.15 * 20 = 3: over the cap, so the draw is pruned.
    const infeasible = parameterConstraintOutcome(
      sirNetConstrainedOptimizationInput,
      bindingsAt(sirNetConstrainedOptimizationInput, {
        population: 1_000,
        infected_ratio: 0.15,
      }),
    );
    expect(infeasible).toMatchObject({
      results: [{ constraintId: "rate-cap" }],
      infeasible: "rate-cap",
    });
    expect(infeasible?.results[0]?.margin).toBeCloseTo(-1);
  });
});
