import { Collapsible } from "@ark-ui/react/collapsible";
import { use, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  Button,
  Drawer,
  Icon,
  LoadingSpinner,
  NumberInput,
  Select,
  TextInput,
  type SelectItem,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  EMPTY_AD_HOC_STATE,
  isWebGpuAvailable,
  synthesizeAdHocOptimization,
} from "@hashintel/petrinaut-core";
import { isConnectedOptimization } from "@hashintel/petrinaut-core/optimization";

import {
  ExperimentsActionsContext,
  type ExperimentMetricSpecInput,
} from "../../../../../../react/experiments/context";
import {
  axisDisplayName,
  buildAdHocSweepAxes,
  buildParameterAxis,
  type ExperimentParameterAxis,
  type ExperimentParameterInput,
} from "../../../../../../react/experiments/parameter-grid";
import { useStableCallback } from "../../../../../../react/hooks/use-stable-callback";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { useOptimizationSource } from "../../../../../../react/optimizations/use-optimization-source";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { AdHocScenarioForm } from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { Section, SectionList } from "../../../../../components/section";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { getMetricDocumentUri } from "../../../../../monaco/editor-paths";
import { useMetricLspSession } from "../metrics/metric-form";
import { summarizeMetricLspErrors } from "../metrics/metric-lsp";
import {
  createMetricKindGroups,
  getMetricKindIcon,
  MODEL_METRIC_VALUE_PREFIX,
  type MetricKindGroup,
} from "../metrics/metric-picker-options";
import { ComputeBackendToggle } from "../shared/compute-backend-toggle";
import { useGpuAvailability } from "../shared/use-gpu-availability";
import {
  type ConstraintDraftsState,
  EMPTY_CONSTRAINT_DRAFTS,
} from "./create-experiment-drawer/constraint-drafts";
import { summarizeConstraintLspErrors } from "./create-experiment-drawer/constraint-lsp";
import { ConstraintsSection } from "./create-experiment-drawer/constraints-section";
import {
  constraintPolicyFor,
  lowerConstraintDrafts,
  stateConstraintGateSpecs,
} from "./create-experiment-drawer/lower-constraint-drafts";
import {
  areMetricLspDiagnosticSummariesEqual,
  EMPTY_METRIC_LSP_DIAGNOSTICS,
  getExperimentMetricDiagnosticError,
  type MetricLspDiagnosticSummary,
} from "./experiment-metric-lsp-validation";
import { ExperimentScenarioRun } from "./experiment-scenario-run";

import type {
  AdHocScenarioState,
  MonteCarloMetricSpec,
  Scenario,
  SDCPN,
} from "@hashintel/petrinaut-core";

// -- Styles -------------------------------------------------------------------

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const labelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(3, minmax(0, 1fr))]",
  gap: "3",
});

const sweepSummaryStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  "&[data-tone='warning']": { color: "orange.s100" },
  "&[data-tone='error']": { color: "red.s100" },
});

const metricListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const metricHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});

const metricCountStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

const metricRowStyle = css({
  display: "flex",
  flexDirection: "column",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  overflow: "hidden",
});

const metricRowHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  padding: "2",
});

const metricHeaderMainStyle = css({
  display: "grid",
  gridTemplateColumns: "[20px minmax(0, 1fr) minmax(160px, 220px)]",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
  flex: "1",
});

const metricCollapseButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[20px]",
  height: "[24px]",
  padding: "[0]",
  border: "[none]",
  background: "[transparent]",
  color: "neutral.s120",
  cursor: "pointer",
});

const metricCollapseIconStyle = css({
  transition: "[transform 200ms ease-in-out]",
  "&[data-state=open]": {
    transform: "[rotate(90deg)]",
  },
});

const metricTitleGroupStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
});

const metricTitleInputStyle = css({
  fontWeight: "semibold",
  marginRight: "1",
});

const metricKindTriggerLabelStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "neutral.s100",
  fontSize: "xs",
  fontWeight: "medium",
});

const metricExpandedContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "[0 16px 16px]",
});

const metricCollapsibleContentStyle = css({
  overflow: "hidden",
  animationDuration: "[200ms]",
  animationTimingFunction: "ease-in-out",
  "&[data-state=open]": {
    animationName: "[petrinautExpand]",
  },
  "&[data-state=closed]": {
    animationName: "[petrinautCollapse]",
  },
});

const metricSpecificFieldsStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
  gap: "2",
});

const codeDiagnosticStyle = css({
  fontSize: "xs",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  marginRight: "auto",
  whiteSpace: "pre-wrap",
});

// -- Constants ----------------------------------------------------------------

const DEFAULT_EXPERIMENT_NAME = "Experiment";
const NO_SCENARIO_VALUE = "__none__";
const DEFAULT_RUN_COUNT = "1000";
const DEFAULT_SEED = "1";
const DEFAULT_DT = "0.1";
const DEFAULT_MAX_TIME = "180";
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
const EMPTY_SCENARIOS: readonly Scenario[] = [];

function getDefaultScenarioSelection(scenarios: readonly Scenario[]): string {
  return scenarios[0]?.id ?? NO_SCENARIO_VALUE;
}

function getEffectiveScenarioSelection(
  scenarios: readonly Scenario[],
  selectedScenarioId: string | null,
): string {
  if (
    selectedScenarioId &&
    (selectedScenarioId === NO_SCENARIO_VALUE ||
      scenarios.some((scenario) => scenario.id === selectedScenarioId))
  ) {
    return selectedScenarioId;
  }

  return getDefaultScenarioSelection(scenarios);
}

function createScenarioOptions(scenarios: readonly Scenario[]) {
  return [
    ...scenarios.map((scenario) => ({
      value: scenario.id,
      text: scenario.name,
    })),
    { value: NO_SCENARIO_VALUE, text: "No scenario" },
  ];
}

type ExperimentMetricKind =
  | "placeTokenCountMean"
  | "transitionFiringCount"
  | "expression";
type TransitionFiringMode = NonNullable<
  Extract<MonteCarloMetricSpec, { kind: "transitionFiringCount" }>["mode"]
>;

type ExperimentMetricDraft = {
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

const transitionModeOptions: { value: TransitionFiringMode; text: string }[] = [
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

function getMetricSummaryLabel(
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

function getDefaultMetricLabel(
  kind: ExperimentMetricKind,
  sdcpn: SDCPN,
): string {
  switch (kind) {
    case "placeTokenCountMean":
      return sdcpn.places[0]
        ? `${sdcpn.places[0].name} tokens`
        : "Place tokens";
    case "transitionFiringCount":
      return sdcpn.transitions[0]
        ? `${sdcpn.transitions[0].name} firing`
        : "Transition firing";
    case "expression":
      return "Custom metric";
  }
}

function canReplaceMetricLabel(label: string, sdcpn: SDCPN): boolean {
  const trimmed = label.trim();

  return new Set([
    "",
    "Custom metric",
    "Place tokens",
    "Transition firing",
    getDefaultMetricLabel("placeTokenCountMean", sdcpn),
    getDefaultMetricLabel("transitionFiringCount", sdcpn),
    getDefaultMetricLabel("expression", sdcpn),
    ...(sdcpn.metrics ?? []).map((metric) => metric.name),
  ]).has(trimmed);
}

function createDefaultMetricDraft(sdcpn: SDCPN): ExperimentMetricDraft {
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
    label: getDefaultMetricLabel(kind, sdcpn),
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

function buildMetricSpecs(
  drafts: readonly ExperimentMetricDraft[],
  sdcpn: SDCPN,
): ExperimentMetricSpecInput[] {
  if (drafts.length === 0) {
    throw new Error("Define at least one metric");
  }

  return drafts.map((draft, index) => {
    const label = draft.label.trim();

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

// -- Component ----------------------------------------------------------------

const ExperimentMetricLspSession = ({
  code,
  metricSessionId,
  onChange,
}: {
  code: string;
  metricSessionId: string;
  onChange: (diagnostics: MetricLspDiagnosticSummary) => void;
}) => {
  useMetricLspSession(code, metricSessionId);
  const { diagnosticsByUri } = use(LanguageClientContext);
  const { count, firstMessage } = summarizeMetricLspErrors(
    diagnosticsByUri,
    metricSessionId,
  );
  const stableOnChange = useStableCallback(onChange);

  useEffect(() => {
    stableOnChange({ count, firstMessage });
  }, [count, firstMessage, stableOnChange]);

  return null;
};

const ExperimentExpressionMetricEditor = ({
  code,
  metricSessionId,
  lspDiagnostics,
  readOnly = false,
  onChange,
}: {
  code: string;
  metricSessionId: string;
  lspDiagnostics: MetricLspDiagnosticSummary;
  readOnly?: boolean;
  onChange: (code: string) => void;
}) => {
  const codeUri = getMetricDocumentUri(metricSessionId);

  return (
    <div className={fieldStyle}>
      <span className={labelStyle}>Code</span>
      <CodeEditor
        language="typescript"
        path={codeUri}
        value={code}
        onChange={(value) => onChange(value ?? "")}
        height="260px"
        options={readOnly ? { readOnly: true } : undefined}
      />
      {lspDiagnostics.count > 0 ? (
        <span className={codeDiagnosticStyle}>
          {lspDiagnostics.firstMessage ?? `${lspDiagnostics.count} diagnostics`}
        </span>
      ) : null}
    </div>
  );
};

const ExperimentMetricRow = ({
  metric,
  sdcpn,
  kindGroups,
  autoFocusLabel,
  onChange,
  onLspDiagnosticsChange,
  onRemove,
}: {
  metric: ExperimentMetricDraft;
  sdcpn: SDCPN;
  kindGroups: MetricKindGroup[];
  autoFocusLabel: boolean;
  onChange: (metric: ExperimentMetricDraft) => void;
  onLspDiagnosticsChange: (diagnostics: MetricLspDiagnosticSummary) => void;
  onRemove: () => void;
}) => {
  const { showAnimations } = use(UserSettingsContext);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const didAutoFocusLabelRef = useRef(false);
  const placeOptions: SelectItem<string>[] = sdcpn.places.map((place) => ({
    value: place.id,
    text: place.name,
  }));
  const transitionOptions: SelectItem<string>[] = sdcpn.transitions.map(
    (transition) => ({
      value: transition.id,
      text: transition.name,
    }),
  );
  const updateMetric = (patch: Partial<ExperimentMetricDraft>) => {
    onChange({ ...metric, ...patch });
  };
  const handleKindChange = (kindValue: string) => {
    // A custom metric defined on the model becomes an expression metric
    // pre-filled with that metric's code and name.
    if (kindValue.startsWith(MODEL_METRIC_VALUE_PREFIX)) {
      const modelMetricId = kindValue.slice(MODEL_METRIC_VALUE_PREFIX.length);
      const modelMetric = sdcpn.metrics?.find(
        (candidate) => candidate.id === modelMetricId,
      );

      if (!modelMetric) {
        return;
      }

      updateMetric({
        kind: "expression",
        code: modelMetric.code,
        sourceMetricId: modelMetric.id,
        lspDiagnostics: EMPTY_METRIC_LSP_DIAGNOSTICS,
        label: canReplaceMetricLabel(metric.label, sdcpn)
          ? modelMetric.name
          : metric.label,
      });

      return;
    }

    const nextKind = kindValue as ExperimentMetricKind;
    const nextLabel = canReplaceMetricLabel(metric.label, sdcpn)
      ? getDefaultMetricLabel(nextKind, sdcpn)
      : metric.label;
    const nextPatch: Partial<ExperimentMetricDraft> = {
      kind: nextKind,
      label: nextLabel,
      sourceMetricId: null,
      lspDiagnostics: EMPTY_METRIC_LSP_DIAGNOSTICS,
    };

    if (
      nextKind === "placeTokenCountMean" &&
      !sdcpn.places.some((place) => place.id === metric.placeId)
    ) {
      nextPatch.placeId = sdcpn.places[0]?.id ?? "";
    }

    if (
      nextKind === "transitionFiringCount" &&
      !sdcpn.transitions.some(
        (transition) => transition.id === metric.transitionId,
      )
    ) {
      nextPatch.transitionId = sdcpn.transitions[0]?.id ?? "";
    }

    updateMetric(nextPatch);
  };

  useLayoutEffect(() => {
    if (!autoFocusLabel || didAutoFocusLabelRef.current) {
      return;
    }

    didAutoFocusLabelRef.current = true;
    labelInputRef.current?.focus();
    labelInputRef.current?.select();
  }, [autoFocusLabel]);

  return (
    <Collapsible.Root
      open={metric.expanded}
      onOpenChange={(details) => updateMetric({ expanded: details.open })}
      className={metricRowStyle}
    >
      {metric.kind === "expression" ? (
        <ExperimentMetricLspSession
          code={metric.code}
          metricSessionId={metric.metricSessionId}
          onChange={onLspDiagnosticsChange}
        />
      ) : null}
      <div className={metricRowHeaderStyle}>
        <div className={metricHeaderMainStyle}>
          <Collapsible.Trigger className={metricCollapseButtonStyle} asChild>
            <button type="button" aria-label="Toggle metric">
              <Icon
                name="chevronRight"
                size="xs"
                className={metricCollapseIconStyle}
                data-state={metric.expanded ? "open" : "closed"}
              />
            </button>
          </Collapsible.Trigger>
          <div className={metricTitleGroupStyle}>
            <TextInput
              inputRef={labelInputRef}
              className={metricTitleInputStyle}
              size="sm"
              variant="subtle"
              value={metric.label}
              placeholder="Untitled metric"
              aria-label="Metric label"
              onChange={(label) => {
                updateMetric({ label });
              }}
            />
          </div>
          <Select
            required
            value={
              metric.sourceMetricId
                ? `${MODEL_METRIC_VALUE_PREFIX}${metric.sourceMetricId}`
                : metric.kind
            }
            onChange={handleKindChange}
            items={kindGroups}
            size="sm"
            renderSelectedItem={() => (
              <span className={metricKindTriggerLabelStyle}>
                {getMetricSummaryLabel(metric, sdcpn)}
              </span>
            )}
            renderItem={(value) => {
              const icon = getMetricKindIcon(value);
              const text =
                kindGroups
                  .flatMap((g) => g.items)
                  .find((it) => it.value === value)?.text ?? value;
              return (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {icon && <Icon name={icon} size="xs" />}
                  {text}
                </span>
              );
            }}
          />
        </div>
        <Button
          aria-label="Remove metric"
          iconName="trash"
          size="xs"
          tone="error"
          tooltip="Remove metric"
          variant="ghost"
          onClick={onRemove}
        />
      </div>

      <Collapsible.Content
        className={cx(
          showAnimations ? metricCollapsibleContentStyle : undefined,
        )}
      >
        <div className={metricExpandedContentStyle}>
          {metric.kind === "placeTokenCountMean" ||
          metric.kind === "transitionFiringCount" ? (
            <div className={metricSpecificFieldsStyle}>
              {metric.kind === "placeTokenCountMean" ? (
                <div className={fieldStyle}>
                  <span className={labelStyle}>Place</span>
                  <Select
                    required
                    value={metric.placeId}
                    onChange={(placeId) => updateMetric({ placeId })}
                    items={placeOptions}
                    size="sm"
                  />
                </div>
              ) : null}
              {metric.kind === "transitionFiringCount" ? (
                <>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Transition</span>
                    <Select
                      required
                      value={metric.transitionId}
                      onChange={(transitionId) =>
                        updateMetric({ transitionId })
                      }
                      items={transitionOptions}
                      size="sm"
                    />
                  </div>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Count</span>
                    <Select
                      required
                      value={metric.transitionMode}
                      onChange={(transitionMode) =>
                        updateMetric({ transitionMode })
                      }
                      items={transitionModeOptions}
                      size="sm"
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {metric.kind === "expression" ? (
            <ExperimentExpressionMetricEditor
              code={metric.code}
              metricSessionId={metric.metricSessionId}
              lspDiagnostics={metric.lspDiagnostics}
              readOnly={metric.sourceMetricId !== null}
              onChange={(code) => updateMetric({ code })}
            />
          ) : null}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

// -- Drawer -------------------------------------------------------------------

interface CreateExperimentDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CreateExperimentDrawer = ({
  open,
  onClose,
}: CreateExperimentDrawerProps) => {
  const { petriNetDefinition, extensions } = use(SDCPNContext);
  // Read here, not in ExperimentsProvider: that provider is mounted outside
  // UserSettingsProvider and so cannot see these settings.
  const { webGpuEnabled, enableParameterSweeps } = use(UserSettingsContext);
  const { createExperiment, setSelectedExperimentId } = use(
    ExperimentsActionsContext,
  );
  const { diagnosticsByUri, requestConstraint } = use(LanguageClientContext);
  const optimizationSource = useOptimizationSource();
  const scenarios = petriNetDefinition.scenarios ?? EMPTY_SCENARIOS;
  const [name, setName] = useState(DEFAULT_EXPERIMENT_NAME);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [paramInputs, setParamInputs] = useState<
    Record<string, ExperimentParameterInput>
  >({});
  const [adHocState, setAdHocState] = useState<AdHocScenarioState | null>(null);
  const [runCount, setRunCount] = useState(DEFAULT_RUN_COUNT);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [dt, setDt] = useState(DEFAULT_DT);
  const [maxTime, setMaxTime] = useState(DEFAULT_MAX_TIME);
  const [metricDrafts, setMetricDrafts] = useState<ExperimentMetricDraft[]>([]);
  const [constraintDrafts, setConstraintDrafts] =
    useState<ConstraintDraftsState>(EMPTY_CONSTRAINT_DRAFTS);
  const [metricLabelFocusId, setMetricLabelFocusId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gpuRequested, setGpuRequested] = useState(false);

  const effectiveSelectedScenarioId = getEffectiveScenarioSelection(
    scenarios,
    selectedScenarioId,
  );

  const selectedScenario: Scenario | undefined =
    effectiveSelectedScenarioId === NO_SCENARIO_VALUE
      ? undefined
      : scenarios.find((s) => s.id === effectiveSelectedScenarioId);

  const scenarioOptions = createScenarioOptions(scenarios);
  const metricKindGroups = createMetricKindGroups(petriNetDefinition);
  const metricDiagnosticError =
    getExperimentMetricDiagnosticError(metricDrafts);
  const metricFormError =
    metricDrafts.length === 0
      ? "Define at least one metric"
      : metricDiagnosticError;

  // The net the ad-hoc form resolves names and types against, shared by the
  // form and by the sweep summary that reads its selections.
  const adHocFormContext = {
    netParameters: extensions.parameters ? petriNetDefinition.parameters : [],
    places: petriNetDefinition.places,
    types: extensions.colors ? petriNetDefinition.types : [],
  };
  const adHocSweeping =
    enableParameterSweeps && effectiveSelectedScenarioId === NO_SCENARIO_VALUE;

  /**
   * The sweep the current interval inputs define. `error` carries the first
   * invalid interval; `null` summary means no parameter sweeps, i.e. a plain
   * single-combination experiment.
   */
  const sweepSummary = ((): {
    text: string;
    tone: "neutral" | "warning" | "error";
    error: boolean;
  } | null => {
    const axes: ExperimentParameterAxis[] = [];
    for (const param of selectedScenario?.scenarioParameters ?? []) {
      const input = paramInputs[param.identifier];
      if (!input || input.mode !== "range") {
        continue;
      }
      const outcome = buildParameterAxis(param, input);
      if (!outcome.ok) {
        return { text: outcome.error, tone: "error", error: true };
      }
      axes.push(outcome.axis);
    }
    if (adHocSweeping && adHocState) {
      // A definition that does not synthesize reports at its slots and
      // refuses to run on submit; the summary only speaks for its sweeps.
      const synthesized = synthesizeAdHocOptimization(
        adHocState,
        adHocFormContext,
      );
      if (synthesized.ok) {
        const outcome = buildAdHocSweepAxes(synthesized.output.optimizedFields);
        if (!outcome.ok) {
          return { text: outcome.error, tone: "error", error: true };
        }
        axes.push(...outcome.axes);
      }
    }
    if (axes.length === 0) {
      return null;
    }
    const names = axes.map(axisDisplayName).join(", ");
    return {
      text: `${axes.length === 1 ? `${names} swept over its interval` : `${names} swept over their intervals`} — the sweep computes only the points you select, click on the Surface or hand to the optimizer`,
      tone: "neutral",
      error: false,
    };
  })();

  // Shown under whichever scenario body is on screen: the form, or a saved
  // scenario shown through it.
  // A sweep computes nothing at creation: it waits for a selection.
  const submitLabel = sweepSummary
    ? isSubmitting
      ? "Creating"
      : "Create sweep"
    : isSubmitting
      ? "Starting"
      : "Run";
  const sweepSummaryLine = sweepSummary ? (
    <span className={sweepSummaryStyle} data-tone={sweepSummary.tone}>
      {sweepSummary.text}
    </span>
  ) : null;

  // Constraints are authored only where a study could ever read them: a
  // saved scenario's sweep, with the in-browser optimizer to drive it — the
  // same facts that make the Parameters card offer Optimize. The rows stay
  // in state while the section is hidden and are never lowered.
  const constraintsEnabled =
    enableParameterSweeps &&
    optimizationSource !== null &&
    isConnectedOptimization(optimizationSource) &&
    selectedScenario !== undefined &&
    sweepSummary !== null;
  const constraintLspError = constraintsEnabled
    ? summarizeConstraintLspErrors(diagnosticsByUri, constraintDrafts.rows)
    : null;

  const footerError = error ?? metricFormError ?? constraintLspError;
  const canRun =
    !isSubmitting &&
    metricFormError === null &&
    constraintLspError === null &&
    sweepSummary?.error !== true;

  // `null` while the drafts are incomplete: the GPU metric gate has nothing to
  // judge yet, and Run is disabled for the same reason. A drafted state
  // constraint rides along as the placeholder spec the gate refuses.
  let draftMetricSpecs: ExperimentMetricSpecInput[] | null = null;
  try {
    draftMetricSpecs = [
      ...buildMetricSpecs(metricDrafts, petriNetDefinition),
      ...(constraintsEnabled
        ? stateConstraintGateSpecs(
            constraintDrafts,
            petriNetDefinition.places[0]?.id,
          )
        : []),
    ];
  } catch {
    draftMetricSpecs = null;
  }

  const webGpuAvailable = isWebGpuAvailable();
  const gpu = useGpuAvailability({
    enabled: open && webGpuEnabled && webGpuAvailable,
    sdcpn: petriNetDefinition,
    extensions,
    metricSpecs: draftMetricSpecs,
  });
  // Derived rather than stored, so a net edited into ineligibility after the
  // switch was flipped neither shows as on nor submits a GPU experiment. The
  // switch's own state and the submitted backend read the same value, so they
  // cannot disagree.
  const gpuSelected = gpuRequested && gpu.available;
  const computeBackend = gpuSelected ? "webgpu" : "cpu";

  const resetForm = () => {
    setName(DEFAULT_EXPERIMENT_NAME);
    setSelectedScenarioId(null);
    setParamInputs({});
    setAdHocState(null);
    setRunCount(DEFAULT_RUN_COUNT);
    setSeed(DEFAULT_SEED);
    setDt(DEFAULT_DT);
    setMaxTime(DEFAULT_MAX_TIME);
    setMetricDrafts([]);
    setConstraintDrafts(EMPTY_CONSTRAINT_DRAFTS);
    setMetricLabelFocusId(null);
    setError(null);
    setIsSubmitting(false);
    setGpuRequested(false);
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }

    resetForm();
    onClose();
  };

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    setParamInputs({});
    // The rows type-checked against the previous scenario's parameters.
    setConstraintDrafts(EMPTY_CONSTRAINT_DRAFTS);
    setError(null);
  };

  const handleAddMetric = () => {
    const nextMetric = createDefaultMetricDraft(petriNetDefinition);

    setError(null);
    setMetricLabelFocusId(nextMetric.id);
    setMetricDrafts((prev) => [
      ...prev.map((metric) => ({ ...metric, expanded: false })),
      nextMetric,
    ]);
  };

  const handleMetricChange = (nextMetric: ExperimentMetricDraft) => {
    setError(null);
    setMetricDrafts((prev) =>
      prev.map((metric) => (metric.id === nextMetric.id ? nextMetric : metric)),
    );
  };

  const handleMetricLspDiagnosticsChange = (
    metricId: string,
    diagnostics: MetricLspDiagnosticSummary,
  ) => {
    setMetricDrafts((prev) => {
      const currentMetric = prev.find((metric) => metric.id === metricId);

      if (
        !currentMetric ||
        areMetricLspDiagnosticSummariesEqual(
          currentMetric.lspDiagnostics,
          diagnostics,
        )
      ) {
        return prev;
      }

      return prev.map((metric) =>
        metric.id === metricId
          ? {
              ...metric,
              lspDiagnostics: diagnostics,
            }
          : metric,
      );
    });
  };

  const handleMetricRemove = (metricId: string) => {
    setError(null);
    setMetricDrafts((prev) => prev.filter((metric) => metric.id !== metricId));
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setError(null);

    if (metricDiagnosticError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const metricSpecs = buildMetricSpecs(metricDrafts, petriNetDefinition);
      // Lowered against the net at creation and never re-lowered; a row that
      // does not compile rejects with its label and lands in the footer.
      const constraints = constraintsEnabled
        ? await lowerConstraintDrafts({
            drafts: constraintDrafts,
            requestConstraint,
            context: {
              netParameters: extensions.parameters
                ? petriNetDefinition.parameters
                : [],
              scenarioParameters: selectedScenario.scenarioParameters,
              sdcpn: petriNetDefinition,
              extensions,
            },
          })
        : [];
      const experiment = await createExperiment({
        name,
        scenarioId:
          effectiveSelectedScenarioId === NO_SCENARIO_VALUE
            ? null
            : effectiveSelectedScenarioId,
        scenarioParameterValues: paramInputs,
        adHocScenario:
          effectiveSelectedScenarioId === NO_SCENARIO_VALUE ? adHocState : null,
        adHocSweeps: adHocSweeping,
        runCount: Number(runCount),
        seed: Number(seed),
        dt: Number(dt),
        maxTime: Number(maxTime),
        metricSpecs,
        // Read here rather than in ExperimentsProvider, which is mounted outside
        // UserSettingsProvider and so cannot see this setting.
        computeBackend,
        constraints,
        constraintPolicy:
          constraints.length > 0
            ? constraintPolicyFor(constraintDrafts.passThresholdPercent)
            : undefined,
      });
      setSelectedExperimentId(experiment.id);
      resetForm();
    } catch (submitError) {
      setIsSubmitting(false);
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Drawer
      shouldCloseOn={isSubmitting ? "none" : undefined}
      showBackdrop={false}
      onClose={handleClose}
    >
      <Drawer.Header
        title="Create an experiment"
        description="Run a Monte Carlo experiment from the current model and scenario"
      />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <SectionList>
          <Section title="Experiment" collapsible defaultOpen>
            <div className={fieldStyle}>
              <span className={labelStyle}>Name</span>
              <TextInput size="sm" value={name} onChange={setName} />
            </div>
            <div className={gridStyle}>
              <div className={fieldStyle}>
                {/* A sweep refines each selection progressively (8, 25, 100,
                    ... 1000, 5000, ...) up to this budget, so for sweeps this
                    is a ceiling, not a batch size — 100,000 is a reasonable
                    value on the GPU. */}
                <span className={labelStyle}>
                  {sweepSummary ? "Max runs per selection" : "Runs"}
                </span>
                <NumberInput
                  size="sm"
                  min={1}
                  value={runCount === "" ? null : Number(runCount)}
                  onChange={(nextRunCount) =>
                    setRunCount(
                      nextRunCount === null ? "" : String(nextRunCount),
                    )
                  }
                />
              </div>
              <div className={fieldStyle}>
                <span className={labelStyle}>Time step</span>
                <NumberInput
                  size="sm"
                  min={0}
                  step="any"
                  value={dt === "" ? null : Number(dt)}
                  onChange={(nextDt) =>
                    setDt(nextDt === null ? "" : String(nextDt))
                  }
                />
              </div>
              <div className={fieldStyle}>
                <span className={labelStyle}>Max time (s)</span>
                <NumberInput
                  size="sm"
                  min={0}
                  step="any"
                  value={maxTime === "" ? null : Number(maxTime)}
                  onChange={(nextMaxTime) =>
                    setMaxTime(nextMaxTime === null ? "" : String(nextMaxTime))
                  }
                />
              </div>
              {/* A labelled cell in the same grid as Runs / Time step / Max time:
                  the backend is a property of the experiment like the rest, and a
                  bare control below the grid read as an orphan. */}
              {webGpuEnabled && webGpuAvailable && (
                <div className={fieldStyle}>
                  <span className={labelStyle}>Backend</span>
                  <ComputeBackendToggle
                    gpu={gpu}
                    selected={gpuSelected}
                    onSelectedChange={setGpuRequested}
                  />
                </div>
              )}
            </div>
            {/* Only shown once WebGPU is switched on in settings — otherwise the
                choice does not exist and the row would be noise. */}
          </Section>

          <Section title="Scenario" collapsible defaultOpen>
            <div className={fieldStyle}>
              <Select
                required
                value={effectiveSelectedScenarioId}
                onChange={handleScenarioChange}
                items={scenarioOptions}
                size="sm"
                renderItem={(value) => {
                  const option = scenarioOptions.find(
                    (opt) => opt.value === value,
                  );
                  return (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {value === NO_SCENARIO_VALUE && (
                        <Icon
                          name="dash"
                          size="xs"
                          className={css({ opacity: "[0.4]" })}
                        />
                      )}
                      {option?.text}
                    </span>
                  );
                }}
              />
            </div>

            {selectedScenario ? (
              // The selected scenario shows through the form in run mode:
              // scenario parameters editable in worksheet style, and a
              // collapsed "Computed state" preview of the exact values and
              // tokens each run starts with.
              <>
                <ExperimentScenarioRun
                  scenario={selectedScenario}
                  context={adHocFormContext}
                  inputs={paramInputs}
                  sweepable={enableParameterSweeps}
                  onInputsChange={(updates) =>
                    setParamInputs((prev) => {
                      const next = { ...prev };
                      for (const update of updates) {
                        next[update.identifier] = update.input;
                      }
                      return next;
                    })
                  }
                />
                {sweepSummaryLine}
              </>
            ) : (
              // With no scenario, the experiment's Initial State + Parameters
              // are defined inline and compile through a scenario generated
              // at experiment start, never persisted. Left untouched, the
              // experiment runs from the model's own initial marking.
              <>
                <AdHocScenarioForm
                  state={adHocState ?? EMPTY_AD_HOC_STATE}
                  onChange={setAdHocState}
                  context={adHocFormContext}
                  selection={enableParameterSweeps ? "sweep" : "none"}
                />
                {sweepSummaryLine}
              </>
            )}
          </Section>

          {constraintsEnabled ? (
            <ConstraintsSection
              drafts={constraintDrafts}
              onChange={setConstraintDrafts}
              scenarioParameters={selectedScenario.scenarioParameters}
              disabled={isSubmitting}
            />
          ) : null}

          <Section title="Metrics" collapsible defaultOpen>
            <div className={metricListStyle}>
              <div className={metricHeaderStyle}>
                <span className={metricCountStyle}>
                  {metricDrafts.length === 0
                    ? "No experiment metrics"
                    : `${metricDrafts.length} experiment metric${
                        metricDrafts.length === 1 ? "" : "s"
                      }`}
                </span>
                <Button
                  variant="subtle"
                  tone="neutral"
                  size="sm"
                  prefix={<Icon name="plus" size="sm" />}
                  onClick={handleAddMetric}
                >
                  Add metric
                </Button>
              </div>

              {metricDrafts.map((metric) => (
                <ExperimentMetricRow
                  key={metric.id}
                  metric={metric}
                  sdcpn={petriNetDefinition}
                  kindGroups={metricKindGroups}
                  autoFocusLabel={metric.id === metricLabelFocusId}
                  onChange={handleMetricChange}
                  onLspDiagnosticsChange={(diagnostics) =>
                    handleMetricLspDiagnosticsChange(metric.id, diagnostics)
                  }
                  onRemove={() => handleMetricRemove(metric.id)}
                />
              ))}
            </div>
          </Section>
        </SectionList>
      </Drawer.Body>
      <Drawer.Footer
        secondaryActions={
          footerError ? (
            <span className={errorStyle}>{footerError}</span>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              disabled={isSubmitting}
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              tone="neutral"
              size="sm"
              disabled={!canRun}
              tooltip={metricFormError ?? constraintLspError ?? undefined}
              prefix={
                isSubmitting ? (
                  <LoadingSpinner size="sm" variant="bars" />
                ) : sweepSummary ? undefined : (
                  <Icon name="play" size="sm" />
                )
              }
              onClick={() => {
                void handleSubmit();
              }}
            >
              {submitLabel}
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
