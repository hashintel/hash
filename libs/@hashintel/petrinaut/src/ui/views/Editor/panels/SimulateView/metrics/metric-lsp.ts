import { DiagnosticSeverity } from "@hashintel/petrinaut-core";

import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type {
  Metric,
  PetrinautExtensionSettings,
  SDCPN,
} from "@hashintel/petrinaut-core";

/**
 * Returns the error-severity LSP diagnostics for the given metric session and
 * the first error message (if any) for compact display.
 *
 * Filtering on the per-session URI prefix (rather than the global
 * `inmemory://sdcpn/_temp/metrics/` prefix) keeps diagnostics from a sibling
 * session — e.g. a Create drawer still alive during a View drawer's open
 * animation — from blocking Save in the wrong drawer.
 */
export function summarizeMetricLspErrors(
  diagnosticsByUri: ReadonlyMap<
    string,
    ReadonlyArray<{ message: string; severity?: DiagnosticSeverity }>
  >,
  sessionId: string,
): { count: number; firstMessage: string | undefined } {
  const sessionPrefix = `inmemory://sdcpn/_temp/metrics/${sessionId}/`;
  let count = 0;
  let firstMessage: string | undefined;
  for (const [uri, diagnostics] of diagnosticsByUri) {
    if (!uri.startsWith(sessionPrefix)) {
      continue;
    }
    const errors = diagnostics.filter(
      (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
    );
    count += errors.length;
    if (firstMessage === undefined && errors.length > 0) {
      firstMessage = errors[0]?.message;
    }
  }
  return { count, firstMessage };
}

/** Compiles the exact metric being submitted instead of relying on an
 * asynchronous LSP snapshot that may still describe the previous keystroke. */
export async function validateMetricCompiles(args: {
  requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"];
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  metric: Metric;
}): Promise<string | undefined> {
  const { requestHirArtifacts, sdcpn, extensions, metric } = args;
  try {
    const { artifacts, failures } = await requestHirArtifacts(
      { ...sdcpn, metrics: [metric] },
      extensions,
    );
    if (artifacts.metrics[metric.id]) {
      return undefined;
    }

    const messages = failures
      .filter(
        (failure) =>
          failure.itemType === "metric" && failure.itemId === metric.id,
      )
      .flatMap((failure) =>
        failure.diagnostics.map((diagnostic) => diagnostic.message),
      );
    return messages.join("; ") || `Metric "${metric.name}" did not compile.`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
