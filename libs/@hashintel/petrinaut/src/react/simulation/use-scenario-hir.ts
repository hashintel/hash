import { use, useEffect, useState } from "react";

import { LanguageClientContext } from "../lsp/context";

import type {
  Scenario,
  ScenarioHir,
  ScenarioLoweringInput,
} from "@hashintel/petrinaut-core";

export type ScenarioHirState = {
  /** The lowered scenario, once the language worker has produced it. */
  hir: ScenarioHir | null;
  /** Why lowering could not run (e.g. the worker terminated). */
  error: string | null;
};

/** Serializes the parts of a scenario that lowering depends on: its code,
 * not its parameter defaults or coloured-place token rows — tweaking a value
 * or editing a row must not re-lower. The key doubles as the request payload
 * (parsed back in the effect), so the effect depends on nothing else. */
const loweringKey = (scenario: Scenario): string => {
  const initialState =
    scenario.initialState.type === "per_place"
      ? {
          type: "per_place" as const,
          // Row arrays carry no code and never lower; only expression
          // strings matter.
          content: Object.fromEntries(
            Object.entries(scenario.initialState.content).filter(
              ([, value]) => typeof value === "string",
            ),
          ),
        }
      : scenario.initialState;
  return JSON.stringify({
    parameterOverrides: scenario.parameterOverrides,
    initialState,
  } satisfies ScenarioLoweringInput);
};

const PENDING: ScenarioHirState = { hir: null, error: null };

/**
 * Lowers a scenario's expressions and code-mode body to HIR via the language
 * worker (where the TypeScript compiler lives), so `compileScenario` can
 * type-check and interpret synchronously during render. Re-lowers only when
 * the scenario's code changes; while the request is in flight the state is
 * `{ hir: null, error: null }` and callers treat the scenario as not yet
 * compiled.
 */
export function useScenarioHir(
  scenario: Scenario | undefined,
): ScenarioHirState {
  const { requestScenarioHir } = use(LanguageClientContext);
  const key = scenario ? loweringKey(scenario) : null;

  const [entry, setEntry] = useState<{
    key: string;
    state: ScenarioHirState;
  } | null>(null);

  useEffect(() => {
    if (key === null) {
      return;
    }
    let cancelled = false;
    const input = JSON.parse(key) as ScenarioLoweringInput;
    requestScenarioHir(input)
      .then((hir) => {
        if (!cancelled) {
          setEntry({ key, state: { hir, error: null } });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEntry({
            key,
            state: {
              hir: null,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, requestScenarioHir]);

  if (key === null) {
    return PENDING;
  }
  return entry !== null && entry.key === key ? entry.state : PENDING;
}
