/**
 * Diagnostics of one form session's documents
 * (`inmemory://sdcpn/_temp/adhoc/<sessionId>/`, the prefix
 * `getAdHocDocumentUri` builds): the total count and the first message, for
 * a drawer footer. Scoped by session id, so another mounted form (the
 * Simulation Settings panel) never leaks its errors into this drawer.
 */
export function summarizeAdHocLspErrors(
  diagnosticsByUri: ReadonlyMap<string, ReadonlyArray<{ message: string }>>,
  sessionId: string,
): { count: number; firstMessage: string | undefined } {
  const prefix = `inmemory://sdcpn/_temp/adhoc/${sessionId}/`;
  let count = 0;
  let firstMessage: string | undefined;
  for (const [uri, diagnostics] of diagnosticsByUri) {
    if (!uri.startsWith(prefix)) {
      continue;
    }
    count += diagnostics.length;
    if (firstMessage === undefined && diagnostics.length > 0) {
      firstMessage = diagnostics[0]?.message;
    }
  }
  return { count, firstMessage };
}
