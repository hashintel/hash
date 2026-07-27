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
  ExperimentsContext,
  type ExperimentMetricSpecInput,
} from "../../../../../../react/experiments/context";
import { useStableCallback } from "../../../../../../react/hooks/use-stable-callback";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
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
import {
  areMetricLspDiagnosticSummariesEqual,
  EMPTY_METRIC_LSP_DIAGNOSTICS,
  getExperimentMetricDiagnosticError,
  type MetricLspDiagnosticSummary,
} from "./experiment-metric-lsp-validation";

import type {
  MonteCarloMetricSpec,
  Scenario,
  ScenarioParameter,
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

const paramRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
});

const paramNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const paramTypeStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  width: "[60px]",
  flexShrink: 0,
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

const emptyParamsStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  paddingY: "[16px]",
  fontSize: "sm",
  color: "neutral.s80",
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

const ScenarioParameterRow = ({
  param,
  value,
  onChange,
}: {
  param: ScenarioParameter;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className={paramRowStyle}>
    <span className={paramNameStyle}>{param.identifier}</span>
    <span className={paramTypeStyle}>{param.type}</span>
    <CodeEditor
      singleLine
      language="typescript"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      placeholder={String(param.default)}
    />
  </div>
);

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
  onCreated?: (experimentId: string) => void;
}

export const CreateExperimentDrawer = ({
  open,
  onClose,
  onCreated,
}: CreateExperimentDrawerProps) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { createExperiment } = use(ExperimentsContext);
  const scenarios = petriNetDefinition.scenarios ?? EMPTY_SCENARIOS;
  const [name, setName] = useState(DEFAULT_EXPERIMENT_NAME);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [runCount, setRunCount] = useState(DEFAULT_RUN_COUNT);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [dt, setDt] = useState(DEFAULT_DT);
  const [maxTime, setMaxTime] = useState(DEFAULT_MAX_TIME);
  const [metricDrafts, setMetricDrafts] = useState<ExperimentMetricDraft[]>([]);
  const [metricLabelFocusId, setMetricLabelFocusId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const footerError = error ?? metricFormError;
  const canRun = !isSubmitting && metricFormError === null;

  const resetForm = () => {
    setName(DEFAULT_EXPERIMENT_NAME);
    setSelectedScenarioId(null);
    setParamValues({});
    setRunCount(DEFAULT_RUN_COUNT);
    setSeed(DEFAULT_SEED);
    setDt(DEFAULT_DT);
    setMaxTime(DEFAULT_MAX_TIME);
    setMetricDrafts([]);
    setMetricLabelFocusId(null);
    setError(null);
    setIsSubmitting(false);
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
    setParamValues({});
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
      const experimentId = await createExperiment({
        name,
        scenarioId:
          effectiveSelectedScenarioId === NO_SCENARIO_VALUE
            ? null
            : effectiveSelectedScenarioId,
        scenarioParameterValues: paramValues,
        runCount: Number(runCount),
        seed: Number(seed),
        dt: Number(dt),
        maxTime: Number(maxTime),
        metricSpecs,
      });
      resetForm();
      onCreated?.(experimentId);
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
                <span className={labelStyle}>Runs</span>
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
            </div>
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
              selectedScenario.scenarioParameters.length === 0 ? (
                <div className={emptyParamsStyle}>No scenario parameters</div>
              ) : (
                selectedScenario.scenarioParameters.map((param) => (
                  <ScenarioParameterRow
                    key={param.identifier}
                    param={param}
                    value={paramValues[param.identifier] ?? ""}
                    onChange={(v) =>
                      setParamValues((prev) => ({
                        ...prev,
                        [param.identifier]: v,
                      }))
                    }
                  />
                ))
              )
            ) : null}
          </Section>

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
              tooltip={metricFormError ?? undefined}
              prefix={
                isSubmitting ? (
                  <LoadingSpinner size="sm" variant="bars" />
                ) : (
                  <Icon name="play" size="sm" />
                )
              }
              onClick={() => {
                void handleSubmit();
              }}
            >
              {isSubmitting ? "Starting" : "Run"}
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
