const SCENARIO_TEMP_URI_PREFIX = "inmemory://sdcpn/_temp/scenarios/";

/**
 * Returns `true` if any active scenario expression has LSP diagnostics.
 * Pure function over the diagnostics map — compute during render, no effect needed.
 */
export function hasScenarioLspErrors(
  diagnosticsByUri: ReadonlyMap<string, readonly unknown[]>,
): boolean {
  for (const [uri, diagnostics] of diagnosticsByUri) {
    if (uri.startsWith(SCENARIO_TEMP_URI_PREFIX) && diagnostics.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the total number of LSP diagnostics across scenario expressions and
 * the first error message (if any) for compact display.
 */
export function summarizeScenarioLspErrors(
  diagnosticsByUri: ReadonlyMap<string, ReadonlyArray<{ message: string }>>,
): { count: number; firstMessage: string | undefined } {
  let count = 0;
  let firstMessage: string | undefined;
  for (const [uri, diagnostics] of diagnosticsByUri) {
    if (!uri.startsWith(SCENARIO_TEMP_URI_PREFIX)) {
      continue;
    }
    count += diagnostics.length;
    if (firstMessage === undefined && diagnostics.length > 0) {
      firstMessage = diagnostics[0]?.message;
    }
  }
  return { count, firstMessage };
}
