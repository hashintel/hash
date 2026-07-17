import { PetrinautOptimizationContext } from "@hashintel/petrinaut/react";

import type {
  AbortSignalLike,
  PetrinautOptimization,
  PetrinautOptimizationEvent,
  PetrinautOptimizationParameterBinding,
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

function sampleBinding(
  binding: Extract<PetrinautOptimizationParameterBinding, { kind: "optimize" }>,
  trial: number,
  requestedTrials: number,
): number | boolean {
  const fraction = requestedTrials <= 1 ? 0.5 : trial / (requestedTrials - 1);
  switch (binding.domain.kind) {
    case "continuous":
      if (binding.domain.scale === "log") {
        const lower = Math.log(binding.domain.minimum);
        const upper = Math.log(binding.domain.maximum);
        return Math.exp(lower + (upper - lower) * fraction);
      }
      return (
        binding.domain.minimum +
        (binding.domain.maximum - binding.domain.minimum) * fraction
      );
    case "integer": {
      const slots =
        Math.floor(
          (binding.domain.maximum - binding.domain.minimum) /
            binding.domain.step,
        ) + 1;
      return (
        binding.domain.minimum +
        (trial % Math.max(1, slots)) * binding.domain.step
      );
    }
    case "boolean":
      return trial % 2 === 0;
  }
}

const fakeOptimization: PetrinautOptimization = {
  async *optimize(input, options) {
    const requestedTrials = input.study.trials;
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
        Object.entries(input.scenario.parameterBindings).flatMap(
          ([identifier, binding]) =>
            binding.kind === "optimize"
              ? [
                  [
                    identifier,
                    sampleBinding(binding, trial, requestedTrials),
                  ] as const,
                ]
              : [],
        ),
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
