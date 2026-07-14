export type MetricLspDiagnosticSummary = {
  count: number;
  firstMessage: string | undefined;
};

export type ExperimentMetricDiagnosticDraft = {
  kind: string;
  type?: "Metric" | "Predicate";
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
  const itemType =
    firstMetricWithDiagnostics.type === "Predicate" ? "Predicate" : "Metric";
  const label =
    firstMetricWithDiagnostics.label.trim() ||
    (itemType === "Predicate" ? "Untitled predicate" : "Untitled metric");

  return `${itemType} "${label}" has ${diagnosticCount} code diagnostic${
    diagnosticCount === 1 ? "" : "s"
  }${firstMessage ? `: ${firstMessage}` : "."}`;
}
