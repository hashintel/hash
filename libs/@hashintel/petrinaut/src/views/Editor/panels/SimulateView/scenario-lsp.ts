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
