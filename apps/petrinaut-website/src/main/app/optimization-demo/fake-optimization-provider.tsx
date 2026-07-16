import { PetrinautOptimizationContext } from "@hashintel/petrinaut/react";

import type {
  AbortSignalLike,
  PetrinautOptimization,
  PetrinautOptimizationEvent,
  PetrinautOptimizationVariable,
} from "@hashintel/petrinaut-core";
import type { FC, PropsWithChildren } from "react";

const wait = (durationMs: number, signal?: AbortSignalLike) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let timeout: number | undefined;
    const handleAbort = () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
      resolve();
    };
    timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });

function sampleVariable(
  variable: PetrinautOptimizationVariable,
  trial: number,
  requestedTrials: number,
): number | boolean {
  const fraction = requestedTrials <= 1 ? 0.5 : trial / (requestedTrials - 1);
  switch (variable.domain.kind) {
    case "continuous":
      if (variable.domain.scale === "log") {
        const lower = Math.log(variable.domain.minimum);
        const upper = Math.log(variable.domain.maximum);
        return Math.exp(lower + (upper - lower) * fraction);
      }
      return (
        variable.domain.minimum +
        (variable.domain.maximum - variable.domain.minimum) * fraction
      );
    case "integer": {
      const slots =
        Math.floor(
          (variable.domain.maximum - variable.domain.minimum) /
            variable.domain.step,
        ) + 1;
      return (
        variable.domain.minimum +
        (trial % Math.max(1, slots)) * variable.domain.step
      );
    }
    case "categorical":
      return variable.domain.values[trial % variable.domain.values.length]!;
  }
}

const fakeOptimization: PetrinautOptimization = {
  async *optimize(input, options) {
    const requestedTrials = input.optimization.trials;
    let best: NonNullable<
      Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"]
    > | null = null;

    yield { type: "started", requestedTrials };

    for (let trial = 0; trial < requestedTrials; trial += 1) {
      await wait(250, options?.signal);
      if (options?.signal?.aborted) {
        return;
      }

      const parameters = Object.fromEntries(
        input.searchSpace.variables.map((variable) => [
          variable.identifier,
          sampleVariable(variable, trial, requestedTrials),
        ]),
      );
      const objective =
        input.objective.direction === "maximize"
          ? trial + 1 / (trial + 1)
          : requestedTrials - trial + 1 / (trial + 1);
      const isBetter =
        best === null ||
        (input.objective.direction === "maximize"
          ? objective > best.objective
          : objective < best.objective);
      if (isBetter) {
        best = { trial, parameters, objective };
      }

      yield {
        type: "trial",
        trial,
        parameters,
        objective,
        state: "complete",
        best,
      };
    }

    yield {
      type: "complete",
      requestedTrials,
      completedTrials: requestedTrials,
      prunedTrials: 0,
      failedTrials: 0,
      best,
    };
  },
};

export const FakeOptimizationProvider: FC<PropsWithChildren> = ({
  children,
}) => (
  <PetrinautOptimizationContext value={fakeOptimization}>
    {children}
  </PetrinautOptimizationContext>
);
