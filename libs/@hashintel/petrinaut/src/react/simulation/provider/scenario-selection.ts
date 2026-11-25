import { resolveNavigatedId } from "../../navigation/resolve-navigated-ids";

import type { Scenario } from "@hashintel/petrinaut-core";

/** The requested scenario resolved through `toPetrinautId`, else the first scenario unless none is allowed. */
export const getEffectiveSelectedScenarioId = (
  scenarios: readonly Scenario[] | undefined,
  selectedScenarioId: string | null | undefined,
  requireScenario = false,
): string | null => {
  if (selectedScenarioId === null && !requireScenario) {
    return null;
  }

  const resolvedScenarioId = selectedScenarioId
    ? resolveNavigatedId(scenarios, selectedScenarioId)
    : null;

  return resolvedScenarioId ?? scenarios?.[0]?.id ?? null;
};

/**
 * Whether the requested scenario has to be rewritten to the one in effect.
 *
 * A host that requires a scenario normalizes an absent or stale request, so a
 * URL without one resolves to a real scenario. A host that does not require
 * one normalizes only a stale request, so an explicit no-scenario choice
 * survives instead of snapping back to the first scenario.
 */
export const shouldNormalizeScenarioSelection = ({
  effectiveSelectedScenarioId,
  requestedScenarioId,
  requireScenario = false,
}: {
  effectiveSelectedScenarioId: string | null;
  requestedScenarioId: string | null | undefined;
  requireScenario?: boolean;
}): boolean => {
  if (requireScenario) {
    return (
      effectiveSelectedScenarioId !== null &&
      requestedScenarioId !== effectiveSelectedScenarioId
    );
  }

  return (
    requestedScenarioId !== undefined &&
    requestedScenarioId !== null &&
    requestedScenarioId !== effectiveSelectedScenarioId
  );
};

/** The values a scenario's parameter inputs start from: each default, as typed text. */
export const getScenarioParameterDefaults = (
  scenario: Scenario | undefined,
): Record<string, string> =>
  Object.fromEntries(
    (scenario?.scenarioParameters ?? []).map((parameter) => [
      parameter.identifier,
      String(parameter.default),
    ]),
  );
