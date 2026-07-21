/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  petrinautOptimizationInputSchema,
  type PetrinautOptimization,
} from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import { PetrinautOptimizationContext } from "../optimization-context";
import {
  OptimizationsContext,
  type OptimizationsContextValue,
} from "./context";
import { OptimizationsProvider } from "./provider";

const scenario = sirModel.petriNetDefinition.scenarios?.find(
  (candidate) => candidate.id === "scenario__seasonal_flu",
);
const metric = sirModel.petriNetDefinition.metrics?.find(
  (candidate) => candidate.id === "metric__infected_fraction",
);
if (!scenario || !metric) {
  throw new Error("The SIR optimization fixtures are incomplete");
}

const input = petrinautOptimizationInputSchema.parse({
  kind: "petrinaut-optimization",
  version: 1,
  name: "SIR optimization",
  model: {
    title: sirModel.title,
    definition: {
      ...sirModel.petriNetDefinition,
      scenarios: [scenario],
      metrics: [metric],
    },
  },
  scenario: {
    id: scenario.id,
    parameterBindings: {
      population: { kind: "fixed", value: 1_000 },
      infected_ratio: {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: 0.001,
          maximum: 0.2,
          scale: "log",
        },
      },
    },
  },
  objective: {
    metricId: "metric__infected_fraction",
    direction: "minimize",
  },
  execution: { seed: 1, dt: 1, maxTime: 180 },
  study: { trials: 2, sampler: "tpe" },
});

const CaptureContext = ({
  onValue,
}: {
  onValue: (value: OptimizationsContextValue) => void;
}) => {
  onValue(use(OptimizationsContext));
  return null;
};

function renderProvider(capability: PetrinautOptimization) {
  let latest: OptimizationsContextValue | null = null;
  render(
    <PetrinautOptimizationContext value={capability}>
      <OptimizationsProvider>
        <CaptureContext
          onValue={(value) => {
            latest = value;
          }}
        />
      </OptimizationsProvider>
    </PetrinautOptimizationContext>,
  );

  return () => {
    if (!latest) {
      throw new Error("Optimization context was not captured");
    }
    return latest;
  };
}

afterEach(cleanup);

describe("OptimizationsProvider", () => {
  it("collects streamed trials and the final best result", async () => {
    const capability: PetrinautOptimization = {
      async *optimize(request) {
        yield { type: "started", requestedTrials: 2 };
        yield {
          type: "trial",
          trial: 0,
          parameters: { infected_ratio: 0.01 },
          objective: 0.4,
          state: "complete",
          best: {
            trial: 0,
            parameters: { infected_ratio: 0.01 },
            objective: 0.4,
          },
        };
        yield {
          type: "trial",
          trial: 1,
          parameters: { infected_ratio: 0.02 },
          objective: 0.2,
          state: "complete",
          best: {
            trial: 1,
            parameters: { infected_ratio: 0.02 },
            objective: 0.2,
          },
        };
        yield {
          type: "complete",
          requestedTrials: request.study.trials,
          completedTrials: 2,
          prunedTrials: 0,
          failedTrials: 0,
          best: {
            trial: 1,
            parameters: { infected_ratio: 0.02 },
            objective: 0.2,
          },
        };
      },
    };
    const getValue = renderProvider(capability);

    await act(async () => {
      await getValue().createOptimization(input);
    });

    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("complete"),
    );
    const optimization = getValue().optimizations[0]!;
    expect(optimization.trials).toHaveLength(2);
    expect(optimization.completedTrials).toBe(2);
    expect(optimization.best).toEqual({
      trial: 1,
      parameters: { infected_ratio: 0.02 },
      objective: 0.2,
    });
  });

  it("aborts and marks an active optimization as cancelled", async () => {
    const capability: PetrinautOptimization = {
      async *optimize(_request, options) {
        yield { type: "started", requestedTrials: 2 };
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener("abort", resolve, { once: true });
        });
      },
    };
    const getValue = renderProvider(capability);
    let optimizationId = "";

    await act(async () => {
      optimizationId = await getValue().createOptimization(input);
    });
    await waitFor(() =>
      expect(getValue().optimizations[0]?.status).toBe("running"),
    );

    act(() => getValue().cancelOptimization(optimizationId));

    expect(getValue().optimizations[0]?.status).toBe("cancelled");
  });
});
