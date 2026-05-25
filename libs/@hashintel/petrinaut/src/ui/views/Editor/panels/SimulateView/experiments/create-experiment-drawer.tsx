import { Collapsible } from "@ark-ui/react/collapsible";
import { use, useEffect, useRef, useState } from "react";

import { Button, Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { compileMetric } from "@hashintel/petrinaut-core";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { Drawer } from "../../../../../components/drawer";
import { Input } from "../../../../../components/input";
import { NumberInput } from "../../../../../components/number-input";
import { Section, SectionList } from "../../../../../components/section";
import { Select } from "../../../../../components/select";
import { Switch } from "../../../../../components/switch";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { getMetricDocumentUri } from "../../../../../monaco/editor-paths";
import { useMetricLspSession } from "../metrics/metric-form";
import { summarizeMetricLspErrors } from "../metrics/metric-lsp";

import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricAggregation,
  MonteCarloUserDefinedMetricSampleRuns,
  MonteCarloUserDefinedMetricTimeAggregation,
  Scenario,
  ScenarioParameter,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { MouseEvent as ReactMouseEvent } from "react";

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

const compactLabelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  lineHeight: "[18px]",
});

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
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
  gridTemplateColumns: "[20px 24px minmax(0, 1fr) auto 28px]",
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

const metricTitleButtonStyle = css({
  minWidth: "[0]",
  padding: "[0]",
  border: "[none]",
  background: "[transparent]",
  color: "neutral.s120",
  cursor: "pointer",
  textAlign: "left",
});

const metricIndexStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[22px]",
  height: "[22px]",
  borderRadius: "full",
  backgroundColor: "neutral.s20",
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "semibold",
});

const metricTitleStyle = css({
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "sm",
  fontWeight: "semibold",
});

const metricTitleInputStyle = css({
  height: "[24px]",
  minWidth: "[0]",
});

const metricKindBadgeStyle = css({
  maxWidth: "[180px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingX: "2",
  paddingY: "1",
  borderRadius: "md",
  backgroundColor: "neutral.s20",
  color: "neutral.s100",
  fontSize: "xs",
  fontWeight: "medium",
});

const metricExpandedContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "[0 8px 8px]",
});

const metricCollapsibleContentStyle = css({
  overflow: "hidden",
  animationDuration: "[200ms]",
  animationTimingFunction: "ease-in-out",
  "&[data-state=open]": {
    animationName: "expand",
  },
  "&[data-state=closed]": {
    animationName: "collapse",
  },
});

const metricMainFieldsStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 220px)]",
  gap: "2",
});

const metricControlsGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(3, minmax(0, 1fr))]",
  gap: "2",
});

const metricCompactPanelStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "2",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
});

const metricCompactPanelGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
  gap: "2",
});

const metricRunOutputFieldStyle = css({
  gridColumn: "[span 2]",
});

const metricRunOutputGroupStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(180px, max-content) minmax(0, 1fr)]",
  alignItems: "center",
  gap: "3",
  minHeight: "[28px]",
  padding: "[2px 8px]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
});

const metricRunOutputToggleStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minWidth: "[180px]",
});

const metricRunAggregationInlineStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto minmax(0, 1fr)]",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
});

const metricInlineLabelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s90",
  whiteSpace: "nowrap",
});

const metricDistributionHintStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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
const DEFAULT_SCENARIO_VALUE = "__default__";
const DEFAULT_RUN_COUNT = "1000";
const DEFAULT_SEED = "1";
const DEFAULT_DT = "1";
const DEFAULT_MAX_TIME = "180";
const DEFAULT_METRIC_CODE = "return 0;";
const DEFAULT_TOKEN_COUNT_DISTRIBUTION_LABEL = "Token count per place";

type ExperimentMetricKind = MonteCarloMetricSpec["kind"];
type ExperimentMetricRunOutputType = "distribution" | "scalar";
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
  runOutputType: ExperimentMetricRunOutputType;
  sampleRuns: MonteCarloUserDefinedMetricSampleRuns;
  aggregateRuns: MonteCarloUserDefinedMetricAggregation;
  aggregateTime: MonteCarloUserDefinedMetricTimeAggregation;
};

const sampleRunOptions: {
  value: MonteCarloUserDefinedMetricSampleRuns;
  label: string;
}[] = [
  { value: "active", label: "Active runs" },
  { value: "completed", label: "Completed runs" },
  { value: "all", label: "All runs" },
];

const aggregateRunOptions: {
  value: MonteCarloUserDefinedMetricAggregation;
  label: string;
}[] = [
  { value: "mean", label: "Average" },
  { value: "sum", label: "Sum" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "last", label: "Last" },
];

const aggregateTimeOptions: {
  value: MonteCarloUserDefinedMetricTimeAggregation;
  label: string;
}[] = [
  { value: "none", label: "Per frame" },
  { value: "mean", label: "Average over time" },
  { value: "sum", label: "Sum over time" },
  { value: "min", label: "Minimum over time" },
  { value: "max", label: "Maximum over time" },
  { value: "last", label: "Last over time" },
];

const transitionModeOptions: { value: TransitionFiringMode; label: string }[] =
  [
    { value: "firedInThisFrame", label: "Frame firing" },
    { value: "cumulative", label: "Cumulative" },
  ];

function getMetricKindLabel(kind: ExperimentMetricKind): string {
  switch (kind) {
    case "placeTokenCountDistribution":
      return "Token count per place";
    case "placeTokenCountMean":
      return "Place tokens";
    case "transitionFiringCount":
      return "Transition firing";
    case "expression":
      return "Custom code";
  }
}

function getMetricSummaryLabel(metric: ExperimentMetricDraft): string {
  const kindLabel = getMetricKindLabel(metric.kind);

  if (metric.kind === "placeTokenCountDistribution") {
    return kindLabel;
  }

  return `${kindLabel} - ${
    metric.runOutputType === "distribution" ? "Distribution" : "Scalar"
  }`;
}

function getDefaultMetricLabel(
  kind: ExperimentMetricKind,
  sdcpn: SDCPN
): string {
  switch (kind) {
    case "placeTokenCountDistribution":
      return DEFAULT_TOKEN_COUNT_DISTRIBUTION_LABEL;
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

function canReplaceMetricLabel(label: string): boolean {
  const trimmed = label.trim();

  return (
    trimmed === "" ||
    trimmed === DEFAULT_TOKEN_COUNT_DISTRIBUTION_LABEL ||
    trimmed === "Custom metric" ||
    trimmed === "Place tokens" ||
    trimmed === "Transition firing"
  );
}

function createMetricKindOptions(sdcpn: SDCPN): {
  value: ExperimentMetricKind;
  label: string;
}[] {
  return [
    {
      value: "placeTokenCountDistribution" as const,
      label: "Token count per place",
    },
    ...(sdcpn.places.length > 0
      ? [{ value: "placeTokenCountMean" as const, label: "Place tokens" }]
      : []),
    ...(sdcpn.transitions.length > 0
      ? [
          {
            value: "transitionFiringCount" as const,
            label: "Transition firing",
          },
        ]
      : []),
    { value: "expression", label: "Custom code" },
  ];
}

function createDefaultMetricDraft(sdcpn: SDCPN): ExperimentMetricDraft {
  const place = sdcpn.places[0];
  const transition = sdcpn.transitions[0];

  return {
    id: crypto.randomUUID(),
    kind: "placeTokenCountDistribution",
    label: DEFAULT_TOKEN_COUNT_DISTRIBUTION_LABEL,
    expanded: true,
    placeId: place?.id ?? "",
    transitionId: transition?.id ?? "",
    transitionMode: "firedInThisFrame",
    code: DEFAULT_METRIC_CODE,
    runOutputType: "scalar",
    sampleRuns: "all",
    aggregateRuns: "mean",
    aggregateTime: "none",
  };
}

function buildMetricSpecs(
  drafts: readonly ExperimentMetricDraft[],
  sdcpn: SDCPN
): MonteCarloMetricSpec[] {
  if (drafts.length === 0) {
    throw new Error("Define at least one metric");
  }

  return drafts.map((draft, index) => {
    const label = draft.label.trim();

    if (label === "") {
      throw new Error(`Metric ${index + 1} needs a label`);
    }

    const runOutput =
      draft.runOutputType === "distribution"
        ? { type: "distribution" as const }
        : {
            type: "scalar" as const,
            aggregateRuns: draft.aggregateRuns,
          };
    const sampledMetricBase = {
      id: draft.id,
      label,
      sampleRuns: draft.sampleRuns,
      runOutput,
      aggregateTime: draft.aggregateTime,
    };

    switch (draft.kind) {
      case "placeTokenCountDistribution": {
        return {
          id: draft.id,
          label,
          kind: "placeTokenCountDistribution",
        };
      }
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
            (transition) => transition.id === draft.transitionId
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
        const compiled = compileMetric({
          id: draft.id,
          name: label,
          code: draft.code,
        });

        if (!compiled.ok) {
          throw new Error(compiled.error);
        }

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

const ExperimentExpressionMetricEditor = ({
  code,
  onChange,
}: {
  code: string;
  onChange: (code: string) => void;
}) => {
  const metricSessionId = useMetricLspSession(code);
  const { diagnosticsByUri } = use(LanguageClientContext);
  const lspErrors = summarizeMetricLspErrors(diagnosticsByUri, metricSessionId);

  return (
    <div className={fieldStyle}>
      <span className={labelStyle}>Code</span>
      <CodeEditor
        language="typescript"
        path={getMetricDocumentUri(metricSessionId)}
        value={code}
        onChange={(value) => onChange(value ?? "")}
        height="128px"
      />
      {lspErrors.count > 0 ? (
        <span className={codeDiagnosticStyle}>
          {lspErrors.firstMessage ?? `${lspErrors.count} diagnostics`}
        </span>
      ) : null}
    </div>
  );
};

const ExperimentMetricRow = ({
  index,
  metric,
  sdcpn,
  kindOptions,
  onChange,
  onRemove,
}: {
  index: number;
  metric: ExperimentMetricDraft;
  sdcpn: SDCPN;
  kindOptions: { value: ExperimentMetricKind; label: string }[];
  onChange: (metric: ExperimentMetricDraft) => void;
  onRemove: () => void;
}) => {
  const { showAnimations } = use(UserSettingsContext);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(metric.label);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const skipNextLabelCommitRef = useRef(false);
  const placeOptions = sdcpn.places.map((place) => ({
    value: place.id,
    label: place.name,
  }));
  const transitionOptions = sdcpn.transitions.map((transition) => ({
    value: transition.id,
    label: transition.name,
  }));
  const updateMetric = (patch: Partial<ExperimentMetricDraft>) => {
    onChange({ ...metric, ...patch });
  };
  const handleKindChange = (value: string) => {
    const nextKind = value as ExperimentMetricKind;
    const nextLabel = canReplaceMetricLabel(metric.label)
      ? getDefaultMetricLabel(nextKind, sdcpn)
      : metric.label;

    updateMetric({
      kind: nextKind,
      label: nextLabel,
    });
  };
  const commitLabel = () => {
    if (skipNextLabelCommitRef.current) {
      skipNextLabelCommitRef.current = false;
      return;
    }

    updateMetric({ label: labelDraft });
    setIsEditingLabel(false);
  };
  const cancelLabelEdit = () => {
    skipNextLabelCommitRef.current = true;
    setLabelDraft(metric.label);
    setIsEditingLabel(false);
  };

  useEffect(() => {
    if (!isEditingLabel) {
      return;
    }

    labelInputRef.current?.focus();
    labelInputRef.current?.select();
  }, [isEditingLabel]);

  return (
    <Collapsible.Root
      open={metric.expanded}
      onOpenChange={(details) => updateMetric({ expanded: details.open })}
      className={metricRowStyle}
    >
      <div className={metricRowHeaderStyle}>
        <div className={metricHeaderMainStyle}>
          <Collapsible.Trigger className={metricCollapseButtonStyle} asChild>
            <button type="button" aria-label="Toggle metric">
              <Icon
                name={metric.expanded ? "chevronDown" : "chevronRight"}
                size="xs"
              />
            </button>
          </Collapsible.Trigger>
          <span className={metricIndexStyle}>{index + 1}</span>
          {isEditingLabel ? (
            <Input
              ref={labelInputRef}
              className={metricTitleInputStyle}
              size="xs"
              value={labelDraft}
              onBlur={commitLabel}
              onChange={(event) => setLabelDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitLabel();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelLabelEdit();
                }
              }}
            />
          ) : (
            <Collapsible.Trigger className={metricTitleButtonStyle} asChild>
              <button type="button">
                <span className={metricTitleStyle}>
                  {metric.label.trim() || "Untitled metric"}
                </span>
              </button>
            </Collapsible.Trigger>
          )}
          <span className={metricKindBadgeStyle}>
            {getMetricSummaryLabel(metric)}
          </span>
          <Button
            aria-label={
              isEditingLabel ? "Save metric label" : "Edit metric label"
            }
            iconName={isEditingLabel ? "check" : "pencil"}
            size="xs"
            tone="neutral"
            tooltip={isEditingLabel ? "Save metric label" : "Edit metric label"}
            tooltipDisplay="inline"
            variant="ghost"
            onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => {
              if (isEditingLabel) {
                event.preventDefault();
              }
            }}
            onClick={() => {
              if (isEditingLabel) {
                commitLabel();
                return;
              }

              skipNextLabelCommitRef.current = false;
              setLabelDraft(metric.label);
              setIsEditingLabel(true);
            }}
          />
        </div>
        <Button
          aria-label="Remove metric"
          iconName="trash"
          size="xs"
          tone="error"
          tooltip="Remove metric"
          tooltipDisplay="inline"
          variant="ghost"
          onClick={onRemove}
        />
      </div>

      <Collapsible.Content
        className={cx(
          showAnimations ? metricCollapsibleContentStyle : undefined
        )}
      >
        <div className={metricExpandedContentStyle}>
          <div className={metricMainFieldsStyle}>
            <div className={fieldStyle}>
              <span className={labelStyle}>Type</span>
              <Select
                value={metric.kind}
                onValueChange={handleKindChange}
                options={kindOptions}
                size="sm"
                portal={false}
              />
            </div>
          </div>

          {metric.kind === "placeTokenCountMean" ? (
            <div className={fieldStyle}>
              <span className={labelStyle}>Place</span>
              <Select
                value={metric.placeId}
                onValueChange={(value) => updateMetric({ placeId: value })}
                options={placeOptions}
                size="sm"
                portal={false}
              />
            </div>
          ) : null}

          {metric.kind === "transitionFiringCount" ? (
            <div className={metricCompactPanelStyle}>
              <span className={compactLabelStyle}>Transition count</span>
              <div className={metricCompactPanelGridStyle}>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Transition</span>
                  <Select
                    value={metric.transitionId}
                    onValueChange={(value) =>
                      updateMetric({ transitionId: value })
                    }
                    options={transitionOptions}
                    size="sm"
                    portal={false}
                  />
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Count</span>
                  <Select
                    value={metric.transitionMode}
                    onValueChange={(value) =>
                      updateMetric({
                        transitionMode: value as TransitionFiringMode,
                      })
                    }
                    options={transitionModeOptions}
                    size="sm"
                    portal={false}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {metric.kind === "expression" ? (
            <ExperimentExpressionMetricEditor
              code={metric.code}
              onChange={(code) => updateMetric({ code })}
            />
          ) : null}

          {metric.kind !== "placeTokenCountDistribution" ? (
            <div className={metricCompactPanelStyle}>
              <span className={compactLabelStyle}>Sampling and output</span>
              <div className={metricControlsGridStyle}>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Runs</span>
                  <Select
                    value={metric.sampleRuns}
                    onValueChange={(value) =>
                      updateMetric({
                        sampleRuns:
                          value as MonteCarloUserDefinedMetricSampleRuns,
                      })
                    }
                    options={sampleRunOptions}
                    size="sm"
                    portal={false}
                  />
                </div>
                <div className={cx(fieldStyle, metricRunOutputFieldStyle)}>
                  <span className={labelStyle}>Run output</span>
                  <div className={metricRunOutputGroupStyle}>
                    <div className={metricRunOutputToggleStyle}>
                      <span className={labelStyle}>Scalar aggregate</span>
                      <Switch
                        checked={metric.runOutputType === "scalar"}
                        onCheckedChange={(checked) =>
                          updateMetric({
                            runOutputType: checked ? "scalar" : "distribution",
                          })
                        }
                      />
                    </div>
                    {metric.runOutputType === "scalar" ? (
                      <div className={metricRunAggregationInlineStyle}>
                        <span className={metricInlineLabelStyle}>
                          Run aggregation
                        </span>
                        <Select
                          value={metric.aggregateRuns}
                          onValueChange={(value) =>
                            updateMetric({
                              aggregateRuns:
                                value as MonteCarloUserDefinedMetricAggregation,
                            })
                          }
                          options={aggregateRunOptions}
                          size="sm"
                          portal={false}
                        />
                      </div>
                    ) : (
                      <span className={metricDistributionHintStyle}>
                        Distribution across sampled runs
                      </span>
                    )}
                  </div>
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Time aggregation</span>
                  <Select
                    value={metric.aggregateTime}
                    onValueChange={(value) =>
                      updateMetric({
                        aggregateTime:
                          value as MonteCarloUserDefinedMetricTimeAggregation,
                      })
                    }
                    options={aggregateTimeOptions}
                    size="sm"
                    portal={false}
                  />
                </div>
              </div>
            </div>
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
  const scenarios = petriNetDefinition.scenarios ?? [];
  const [name, setName] = useState(DEFAULT_EXPERIMENT_NAME);
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    DEFAULT_SCENARIO_VALUE
  );
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [runCount, setRunCount] = useState(DEFAULT_RUN_COUNT);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [dt, setDt] = useState(DEFAULT_DT);
  const [maxTime, setMaxTime] = useState(DEFAULT_MAX_TIME);
  const [metricDrafts, setMetricDrafts] = useState<ExperimentMetricDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedScenario: Scenario | undefined =
    selectedScenarioId === DEFAULT_SCENARIO_VALUE
      ? undefined
      : scenarios.find((s) => s.id === selectedScenarioId);

  const scenarioOptions = [
    { value: DEFAULT_SCENARIO_VALUE, label: "(Default)" },
    ...scenarios.map((s) => ({ value: s.id, label: s.name })),
  ];
  const metricKindOptions = createMetricKindOptions(petriNetDefinition);

  const resetForm = () => {
    setName(DEFAULT_EXPERIMENT_NAME);
    setSelectedScenarioId(DEFAULT_SCENARIO_VALUE);
    setParamValues({});
    setRunCount(DEFAULT_RUN_COUNT);
    setSeed(DEFAULT_SEED);
    setDt(DEFAULT_DT);
    setMaxTime(DEFAULT_MAX_TIME);
    setMetricDrafts([]);
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

  const handleScenarioChange = (value: string) => {
    setSelectedScenarioId(value);
    setParamValues({});
    setError(null);
  };

  const handleAddMetric = () => {
    setMetricDrafts((prev) => [
      ...prev.map((metric) => ({ ...metric, expanded: false })),
      createDefaultMetricDraft(petriNetDefinition),
    ]);
  };

  const handleMetricChange = (nextMetric: ExperimentMetricDraft) => {
    setMetricDrafts((prev) =>
      prev.map((metric) => (metric.id === nextMetric.id ? nextMetric : metric))
    );
  };

  const handleMetricRemove = (metricId: string) => {
    setMetricDrafts((prev) => prev.filter((metric) => metric.id !== metricId));
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const metricSpecs = buildMetricSpecs(metricDrafts, petriNetDefinition);
      const experimentId = await createExperiment({
        name,
        scenarioId:
          selectedScenarioId === DEFAULT_SCENARIO_VALUE
            ? null
            : selectedScenarioId,
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
        submitError instanceof Error ? submitError.message : String(submitError)
      );
    }
  };

  return (
    <Drawer.Root open={open} onClose={handleClose}>
      <Drawer.Card onClose={handleClose}>
        <Drawer.Header description="Run a Monte Carlo experiment from the current model and scenario">
          Create an experiment
        </Drawer.Header>
        <Drawer.Body>
          <SectionList>
            <Section title="Experiment" collapsible defaultOpen>
              <div className={fieldStyle}>
                <span className={labelStyle}>Name</span>
                <Input
                  size="md"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </div>
              <div className={gridStyle}>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Runs</span>
                  <NumberInput
                    size="md"
                    min={1}
                    step={1}
                    value={runCount}
                    onChange={(event) => setRunCount(event.currentTarget.value)}
                  />
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Seed</span>
                  <NumberInput
                    size="md"
                    step={1}
                    value={seed}
                    onChange={(event) => setSeed(event.currentTarget.value)}
                  />
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Time step</span>
                  <NumberInput
                    size="md"
                    min={0}
                    step="any"
                    value={dt}
                    onChange={(event) => setDt(event.currentTarget.value)}
                  />
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Max time</span>
                  <NumberInput
                    size="md"
                    min={0}
                    step="any"
                    value={maxTime}
                    onChange={(event) => setMaxTime(event.currentTarget.value)}
                  />
                </div>
              </div>
            </Section>

            <Section title="Scenario" collapsible defaultOpen>
              <div className={fieldStyle}>
                <span className={labelStyle}>Scenario</span>
                <Select
                  value={selectedScenarioId}
                  onValueChange={handleScenarioChange}
                  options={scenarioOptions}
                  size="md"
                  portal={false}
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

                {metricDrafts.map((metric, index) => (
                  <ExperimentMetricRow
                    key={metric.id}
                    index={index}
                    metric={metric}
                    sdcpn={petriNetDefinition}
                    kindOptions={metricKindOptions}
                    onChange={handleMetricChange}
                    onRemove={() => handleMetricRemove(metric.id)}
                  />
                ))}
              </div>
            </Section>
          </SectionList>
        </Drawer.Body>
      </Drawer.Card>
      <Drawer.Footer>
        {error ? <span className={errorStyle}>{error}</span> : null}
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
          disabled={isSubmitting}
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
      </Drawer.Footer>
    </Drawer.Root>
  );
};
