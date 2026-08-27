const SCENARIO_TEMP_URI_PREFIX = "inmemory://sdcpn/_temp/scenarios/";

/**
 * Returns the total number of LSP diagnostics across scenario expressions and
 * the first error message (if any) for compact display. With
 * `adHocSessionId`, that one ad-hoc form session's documents count too —
 * scoped by id, so another mounted ad-hoc form (the Simulation Settings
 * panel) never leaks its errors into this drawer's footer.
 */
export function summarizeScenarioLspErrors(
  diagnosticsByUri: ReadonlyMap<string, ReadonlyArray<{ message: string }>>,
  options: { adHocSessionId?: string } = {},
): { count: number; firstMessage: string | undefined } {
  const adHocPrefix = options.adHocSessionId
    ? `inmemory://sdcpn/_temp/adhoc/${options.adHocSessionId}/`
    : null;
  let count = 0;
  let firstMessage: string | undefined;
  for (const [uri, diagnostics] of diagnosticsByUri) {
    if (
      !uri.startsWith(SCENARIO_TEMP_URI_PREFIX) &&
      !(adHocPrefix !== null && uri.startsWith(adHocPrefix))
    ) {
      continue;
    }
    count += diagnostics.length;
    if (firstMessage === undefined && diagnostics.length > 0) {
      firstMessage = diagnostics[0]?.message;
    }
  }
  return { count, firstMessage };
}
