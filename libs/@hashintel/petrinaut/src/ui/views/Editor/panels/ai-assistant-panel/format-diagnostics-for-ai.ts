import type { Diagnostic, DocumentUri } from "vscode-languageserver-types";
import { DiagnosticSeverity } from "vscode-languageserver-types";

import { parseDocumentUri } from "../../../../../core/lsp/lib/document-uris";
import type { SDCPN } from "../../../../../core/types/sdcpn";

const DEFAULT_MAX_DIAGNOSTICS = 25;

const diagnosticSeverityLabel = (
  severity: DiagnosticSeverity | undefined,
): string => {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return "error";
    case DiagnosticSeverity.Warning:
      return "warning";
    case DiagnosticSeverity.Information:
      return "info";
    case DiagnosticSeverity.Hint:
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
    return "No errors detected in your model – everything compiles!";
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
