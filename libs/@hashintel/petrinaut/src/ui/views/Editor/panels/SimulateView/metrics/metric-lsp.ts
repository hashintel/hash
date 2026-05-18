/**
 * Returns the total number of LSP diagnostics for the given metric session and
 * the first error message (if any) for compact display.
 *
 * Filtering on the per-session URI prefix (rather than the global
 * `inmemory://sdcpn/_temp/metrics/` prefix) keeps diagnostics from a sibling
 * session — e.g. a Create drawer still alive during a View drawer's open
 * animation — from blocking Save in the wrong drawer.
 */
export function summarizeMetricLspErrors(
  diagnosticsByUri: ReadonlyMap<string, ReadonlyArray<{ message: string }>>,
  sessionId: string,
): { count: number; firstMessage: string | undefined } {
  const sessionPrefix = `inmemory://sdcpn/_temp/metrics/${sessionId}/`;
  let count = 0;
  let firstMessage: string | undefined;
  for (const [uri, diagnostics] of diagnosticsByUri) {
    if (!uri.startsWith(sessionPrefix)) {
      continue;
    }
    count += diagnostics.length;
    if (firstMessage === undefined && diagnostics.length > 0) {
      firstMessage = diagnostics[0]?.message;
    }
  }
  return { count, firstMessage };
}
