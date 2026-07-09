export type MetricLspDiagnosticSummary = {
  count: number;
  firstMessage: string | undefined;
};

export type ExperimentMetricDiagnosticDraft = {
  kind: string;
  label: string;
  lspDiagnostics: MetricLspDiagnosticSummary;
};

export const EMPTY_METRIC_LSP_DIAGNOSTICS: MetricLspDiagnosticSummary = {
  count: 0,
  firstMessage: undefined,
};

export function areMetricLspDiagnosticSummariesEqual(
  left: MetricLspDiagnosticSummary,
  right: MetricLspDiagnosticSummary,
): boolean {
  return left.count === right.count && left.firstMessage === right.firstMessage;
}

export function getExperimentMetricDiagnosticError(
  drafts: readonly ExperimentMetricDiagnosticDraft[],
): string | null {
  const firstMetricWithDiagnostics = drafts.find(
    (draft) => draft.kind === "expression" && draft.lspDiagnostics.count > 0,
  );

  if (!firstMetricWithDiagnostics) {
    return null;
  }

  const diagnosticCount = firstMetricWithDiagnostics.lspDiagnostics.count;
  const firstMessage = firstMetricWithDiagnostics.lspDiagnostics.firstMessage;
  const label = firstMetricWithDiagnostics.label.trim() || "Untitled metric";

  return `Metric "${label}" has ${diagnosticCount} code diagnostic${
    diagnosticCount === 1 ? "" : "s"
  }${firstMessage ? `: ${firstMessage}` : "."}`;
}
