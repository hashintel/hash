/**
 * A metric of the Create Experiment form as plain data: the draft a row
 * edits, its labels, and the specs the experiment is created with.
 */
import { MODEL_METRIC_VALUE_PREFIX } from "../../metrics/metric-picker-options";
import {
  EMPTY_METRIC_LSP_DIAGNOSTICS,
  type MetricLspDiagnosticSummary,
} from "../experiment-metric-lsp-validation";

import type { ExperimentMetricSpecInput } from "../../../../../../../react/experiments/context";
import type { MonteCarloMetricSpec, SDCPN } from "@hashintel/petrinaut-core";

const DEFAULT_METRIC_CODE = `/**
* Custom metric code that will be run on each frame.
* It must \`return\` a single finite number.
*
* The only thing in scope is \`state\`, a snapshot of the current frame:
*   state.places["Place Name"].count   -> number of tokens in a place
*   state.places["Place Name"].tokens  -> array of token objects (for colored places)
*
* Reference places by their exact name. Use bracket access for names
* with spaces, e.g. state.places["Work In Progress"].
*
* --- Example: the sum of tokens in two places ---
* return state.places["Susceptible"].count + state.places["Infected"].count;
*/

return 0;`;

type ExperimentMetricKind =
  | "placeTokenCountMean"
  | "transitionFiringCount"
  | "expression";
type TransitionFiringMode = NonNullable<
  Extract<MonteCarloMetricSpec, { kind: "transitionFiringCount" }>["mode"]
>;

export type ExperimentMetricDraft = {
  id: string;
  kind: ExperimentMetricKind;
  label: string;
  expanded: boolean;
  placeId: string;
  transitionId: string;
  transitionMode: TransitionFiringMode;
  code: string;
  // Set when this metric was picked from a custom metric defined on the model.
  sourceMetricId: string | null;
  metricSessionId: string;
  lspDiagnostics: MetricLspDiagnosticSummary;
};

export const transitionModeOptions: {
  value: TransitionFiringMode;
  text: string;
}[] = [
  { value: "firedInThisFrame", text: "Per frame" },
  { value: "cumulative", text: "Cumulative" },
];

function getMetricKindLabel(kind: ExperimentMetricKind): string {
  switch (kind) {
    case "placeTokenCountMean":
      return "Place tokens";
    case "transitionFiringCount":
      return "Transition firing";
    case "expression":
      return "Custom code";
  }
}

export function getMetricSummaryLabel(
  metric: ExperimentMetricDraft,
  sdcpn: SDCPN,
): string {
  if (metric.sourceMetricId) {
    const modelMetric = sdcpn.metrics?.find(
      (candidate) => candidate.id === metric.sourceMetricId,
    );

    if (modelMetric) {
      return modelMetric.name;
    }
  }

  return getMetricKindLabel(metric.kind);
}

export const getMetricLabel = (
  metric: ExperimentMetricDraft,
  sdcpn: SDCPN,
): string => {
  switch (metric.kind) {
    case "placeTokenCountMean": {
      const selectedPlace = sdcpn.places.find(
        (place) => place.id === metric.placeId,
      );
      return selectedPlace ? `${selectedPlace.name} tokens` : "Place tokens";
    }
    case "transitionFiringCount": {
      const selectedTransition = sdcpn.transitions.find(
        (transition) => transition.id === metric.transitionId,
      );
      const mode =
        metric.transitionMode === "cumulative" ? "cumulative" : "per frame";
      return selectedTransition
        ? `${selectedTransition.name} firing (${mode})`
        : "Transition firing";
    }
    case "expression":
      return (
        sdcpn.metrics?.find(
          (candidate) => candidate.id === metric.sourceMetricId,
        )?.name ?? metric.label.trim()
      );
  }
};

function canReplaceMetricLabel(label: string, sdcpn: SDCPN): boolean {
  const trimmed = label.trim();

  return new Set([
    "",
    "Custom metric",
    ...(sdcpn.metrics ?? []).map((metric) => metric.name),
  ]).has(trimmed);
}

export function createDefaultMetricDraft(sdcpn: SDCPN): ExperimentMetricDraft {
  const place = sdcpn.places[0];
  const transition = sdcpn.transitions[0];
  const kind: ExperimentMetricKind = place
    ? "placeTokenCountMean"
    : transition
      ? "transitionFiringCount"
      : "expression";

  return {
    id: crypto.randomUUID(),
    kind,
    label: "Custom metric",
    expanded: true,
    placeId: place?.id ?? "",
    transitionId: transition?.id ?? "",
    transitionMode: "firedInThisFrame",
    code: DEFAULT_METRIC_CODE,
    sourceMetricId: null,
    metricSessionId: crypto.randomUUID(),
    lspDiagnostics: EMPTY_METRIC_LSP_DIAGNOSTICS,
  };
}

/**
 * What picking `kindValue` in a row's type select changes on its draft, or
 * null when the value names a model metric that no longer exists.
 */
export const metricKindPatch = (
  metric: ExperimentMetricDraft,
  kindValue: string,
  sdcpn: SDCPN,
): Partial<ExperimentMetricDraft> | null => {
  // A custom metric defined on the model becomes an expression metric
  // pre-filled with that metric's code and name.
  if (kindValue.startsWith(MODEL_METRIC_VALUE_PREFIX)) {
    const modelMetricId = kindValue.slice(MODEL_METRIC_VALUE_PREFIX.length);
    const modelMetric = sdcpn.metrics?.find(
      (candidate) => candidate.id === modelMetricId,
    );

    if (!modelMetric) {
      return null;
    }

    return {
      kind: "expression",
      code: modelMetric.code,
      sourceMetricId: modelMetric.id,
      lspDiagnostics: EMPTY_METRIC_LSP_DIAGNOSTICS,
      label: canReplaceMetricLabel(metric.label, sdcpn)
        ? modelMetric.name
        : metric.label,
    };
  }

  const nextKind = kindValue as ExperimentMetricKind;
  const patch: Partial<ExperimentMetricDraft> = {
    kind: nextKind,
    label: canReplaceMetricLabel(metric.label, sdcpn)
      ? "Custom metric"
      : metric.label,
    sourceMetricId: null,
    lspDiagnostics: EMPTY_METRIC_LSP_DIAGNOSTICS,
  };

  if (
    nextKind === "placeTokenCountMean" &&
    !sdcpn.places.some((place) => place.id === metric.placeId)
  ) {
    patch.placeId = sdcpn.places[0]?.id ?? "";
  }

  if (
    nextKind === "transitionFiringCount" &&
    !sdcpn.transitions.some(
      (transition) => transition.id === metric.transitionId,
    )
  ) {
    patch.transitionId = sdcpn.transitions[0]?.id ?? "";
  }

  return patch;
};

export function buildMetricSpecs(
  drafts: readonly ExperimentMetricDraft[],
  sdcpn: SDCPN,
): ExperimentMetricSpecInput[] {
  if (drafts.length === 0) {
    throw new Error("Define at least one metric");
  }

  return drafts.map((draft, index) => {
    const label = getMetricLabel(draft, sdcpn);

    if (label === "") {
      throw new Error(`Metric ${index + 1} needs a label`);
    }

    const sampledMetricBase = {
      id: draft.id,
      label,
      sampleRuns: "all" as const,
      runOutput: { type: "distribution" as const },
    };

    switch (draft.kind) {
      case "placeTokenCountMean": {
        if (!sdcpn.places.some((place) => place.id === draft.placeId)) {
          throw new Error(`Metric "${label}" needs a valid place`);
        }

        return {
          ...sampledMetricBase,
          kind: "placeTokenCountMean",
          placeId: draft.placeId,
        };
      }
      case "transitionFiringCount": {
        if (
          !sdcpn.transitions.some(
            (transition) => transition.id === draft.transitionId,
          )
        ) {
          throw new Error(`Metric "${label}" needs a valid transition`);
        }

        return {
          ...sampledMetricBase,
          kind: "transitionFiringCount",
          transitionId: draft.transitionId,
          mode: draft.transitionMode,
        };
      }
      case "expression": {
        if (draft.code.trim() === "") {
          throw new Error(`Metric "${label}" code is required`);
        }

        // Compilation happens through the HIR when the experiment starts
        // (the provider attaches the compiled artifact); live validation is
        // covered by the metric LSP session diagnostics.
        return {
          ...sampledMetricBase,
          kind: "expression",
          code: draft.code,
        };
      }
      default: {
        const exhaustive: never = draft.kind;
        throw new Error(`Unsupported metric type: ${String(exhaustive)}`);
      }
    }
  });
}
