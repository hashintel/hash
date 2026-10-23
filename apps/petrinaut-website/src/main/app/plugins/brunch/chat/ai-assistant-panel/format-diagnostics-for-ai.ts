import { parseDocumentUri, type SDCPN } from "@hashintel/petrinaut-core";

import type { DiagnosticsSnapshot } from "@hashintel/petrinaut/ui/plugin";

// The language service's diagnostics, typed from the plugin API rather than
// from the LSP types package, which the website does not depend on.
type DiagnosticsByUri = DiagnosticsSnapshot["byUri"];
type DocumentUri =
  DiagnosticsByUri extends Map<infer Uri, unknown> ? Uri : never;
type Diagnostic =
  DiagnosticsByUri extends Map<unknown, (infer Item)[]> ? Item : never;

const DEFAULT_MAX_DIAGNOSTICS = 25;

/** The LSP `DiagnosticSeverity` codes. */
const diagnosticSeverity = {
  error: 1,
  warning: 2,
  information: 3,
  hint: 4,
} as const;

const diagnosticSeverityLabel = (
  severity: Diagnostic["severity"] | undefined,
): string => {
  switch (severity) {
    case diagnosticSeverity.error:
      return "error";
    case diagnosticSeverity.warning:
      return "warning";
    case diagnosticSeverity.information:
      return "info";
    case diagnosticSeverity.hint:
      return "hint";
    default:
      return "error";
  }
};

const getDiagnosticEntityLabel = (uri: DocumentUri, definition: SDCPN) => {
  const parsed = parseDocumentUri(uri);
  if (!parsed) {
    return `Document: ${uri}`;
  }

  if (parsed.itemType === "differential-equation") {
    const differentialEquation = definition.differentialEquations.find(
      (item) => item.id === parsed.itemId,
    );

    return `Differential Equation: ${differentialEquation?.name ?? parsed.itemId}`;
  }

  const transition = definition.transitions.find(
    (item) => item.id === parsed.itemId,
  );
  const transitionName = transition?.name ?? parsed.itemId;
  const transitionPart =
    parsed.itemType === "transition-lambda" ? "lambda" : "kernel";

  return `Transition: ${transitionName} ${transitionPart}`;
};

export const formatDiagnosticsForAi = ({
  definition,
  diagnosticsByUri,
  maxDiagnostics = DEFAULT_MAX_DIAGNOSTICS,
}: {
  definition: SDCPN;
  diagnosticsByUri: Map<DocumentUri, Diagnostic[]>;
  maxDiagnostics?: number;
}): string => {
  const diagnostics = Array.from(diagnosticsByUri.entries()).flatMap(
    ([uri, uriDiagnostics]) =>
      uriDiagnostics.map((diagnostic) => ({ diagnostic, uri })),
  );

  if (diagnostics.length === 0) {
    return "No errors or warnings found in net function code. Scenario and metric compilation is checked when creating an experiment.";
  }

  const shownDiagnostics = diagnostics.slice(0, maxDiagnostics);
  const lines = [
    `Current TypeScript diagnostics (${diagnostics.length} issue${
      diagnostics.length === 1 ? "" : "s"
    }):`,
  ];

  for (const { diagnostic, uri } of shownDiagnostics) {
    const code = diagnostic.code == null ? "" : ` TS${diagnostic.code}`;
    const line = diagnostic.range.start.line + 1;
    const column = diagnostic.range.start.character + 1;

    lines.push(
      `- ${getDiagnosticEntityLabel(uri, definition)}: ${diagnosticSeverityLabel(
        diagnostic.severity,
      )}${code} at Ln ${line}, Col ${column}: ${diagnostic.message}`,
    );
  }

  const omittedDiagnosticsCount = diagnostics.length - shownDiagnostics.length;
  if (omittedDiagnosticsCount > 0) {
    lines.push(
      `... ${omittedDiagnosticsCount} additional diagnostic${
        omittedDiagnosticsCount === 1 ? "" : "s"
      } omitted.`,
    );
  }

  return lines.join("\n");
};
