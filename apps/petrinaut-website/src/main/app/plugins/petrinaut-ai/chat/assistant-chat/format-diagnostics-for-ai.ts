import { parseDocumentUri, type SDCPN } from "@hashintel/petrinaut-core";

import type { DiagnosticsSnapshot } from "@hashintel/petrinaut/ui/plugin";

type DiagnosticsByUri = DiagnosticsSnapshot["byUri"];
type Diagnostic =
  DiagnosticsByUri extends Map<string, (infer Item)[]> ? Item : never;

const DEFAULT_MAX_DIAGNOSTICS = 25;

/** Labels for the LSP severity codes a diagnostic carries. */
const severityLabels: Record<number, string> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "hint",
};

const diagnosticSeverityLabel = (severity: Diagnostic["severity"]): string =>
  severityLabels[severity ?? 1] ?? "error";

const getDiagnosticEntityLabel = (uri: string, definition: SDCPN) => {
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

  if (parsed.itemType === "place-visualizer") {
    const place = definition.places.find((item) => item.id === parsed.itemId);

    return `Place: ${place?.name ?? parsed.itemId} visualizer`;
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
  diagnosticsByUri: DiagnosticsByUri;
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
