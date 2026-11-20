import { Collapsible } from "@ark-ui/react/collapsible";
import { use, useLayoutEffect, useRef } from "react";

import {
  Button,
  Icon,
  Select,
  TextInput,
  type SelectItem,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { getMetricDocumentUri } from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { useUserSettings } from "../../../../../../../react/state/user-settings-context";
import { CodeEditor } from "../../../../../../monaco/code-editor";
import { summarizeMetricLspErrors } from "../../metrics/metric-lsp";
import {
  getMetricKindIcon,
  MODEL_METRIC_VALUE_PREFIX,
  type MetricKindGroup,
} from "../../metrics/metric-picker-options";
import { useMetricLspSession } from "../../metrics/use-metric-lsp-session";
import { fieldStyle, labelStyle } from "./form-field-styles";
import {
  getMetricLabel,
  getMetricSummaryLabel,
  metricKindPatch,
  transitionModeOptions,
  type ExperimentMetricDraft,
} from "./metric-drafts";

import type { SDCPN } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

const metricRowStyle = css({
  display: "flex",
  flexDirection: "column",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  overflow: "hidden",
  "&[data-objective=true]": {
    borderColor: "purple.s60",
    backgroundColor: "purple.s10",
  },
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
  _focusVisible: {
    outline: "[2px solid {colors.neutral.s100}]",
    outlineOffset: "[2px]",
  },
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

const metricTitleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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

/** Keeps the metric's language session alive while its row is collapsed. */
const ExperimentMetricLspSession = ({
  code,
  metricSessionId,
}: {
  code: string;
  metricSessionId: string;
}) => {
  useMetricLspSession(code, metricSessionId);
  return null;
};

const ExperimentExpressionMetricEditor = ({
  code,
  metricSessionId,
  readOnly = false,
  onChange,
  onEscape,
}: {
  code: string;
  metricSessionId: string;
  readOnly?: boolean;
  onChange: (code: string) => void;
  onEscape: () => void;
}) => {
  const { diagnosticsByUri } = use(LanguageClientContext);
  const errors = summarizeMetricLspErrors(diagnosticsByUri, metricSessionId);
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
        options={{
          readOnly,
          tabFocusMode: true,
          ariaLabel: "Custom metric code",
        }}
        onEscape={onEscape}
      />
      {errors.count > 0 ? (
        <span className={codeDiagnosticStyle}>
          {errors.firstMessage ?? `${errors.count} diagnostics`}
        </span>
      ) : null}
    </div>
  );
};

export const ExperimentMetricRow = ({
  metric,
  sdcpn,
  kindGroups,
  autoFocusLabel,
  isObjective,
  onChange,
  onRemove,
  registerTrigger,
  footer,
}: {
  metric: ExperimentMetricDraft;
  sdcpn: SDCPN;
  kindGroups: MetricKindGroup[];
  autoFocusLabel: boolean;
  isObjective: boolean;
  onChange: (metricId: string, patch: Partial<ExperimentMetricDraft>) => void;
  onRemove: (metricId: string) => void;
  /** Tells the list which button to focus when a neighbouring row is removed. */
  registerTrigger: (
    metricId: string,
    element: HTMLButtonElement | null,
  ) => void;
  footer?: ReactNode;
}) => {
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const didAutoFocusLabelRef = useRef(false);
  const metricLabel = getMetricLabel(metric, sdcpn);
  const isCustomMetric =
    metric.kind === "expression" && metric.sourceMetricId === null;
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
    onChange(metric.id, patch);
  };
  const handleKindChange = (kindValue: string) => {
    const patch = metricKindPatch(metric, kindValue, sdcpn);
    if (patch) {
      updateMetric(patch);
    }
  };

  useLayoutEffect(() => {
    if (!isCustomMetric || !autoFocusLabel || didAutoFocusLabelRef.current) {
      return;
    }

    didAutoFocusLabelRef.current = true;
    labelInputRef.current?.focus();
    labelInputRef.current?.select();
  }, [autoFocusLabel, isCustomMetric]);

  return (
    <Collapsible.Root
      open={metric.expanded}
      onOpenChange={(details) => updateMetric({ expanded: details.open })}
      className={metricRowStyle}
      data-objective={isObjective}
      role="group"
      aria-label={metricLabel || "Untitled metric"}
    >
      {metric.kind === "expression" ? (
        <ExperimentMetricLspSession
          key={metric.metricSessionId}
          code={metric.code}
          metricSessionId={metric.metricSessionId}
        />
      ) : null}
      <div className={metricRowHeaderStyle}>
        <div className={metricHeaderMainStyle}>
          <Collapsible.Trigger className={metricCollapseButtonStyle} asChild>
            <button
              type="button"
              aria-label="Toggle metric"
              ref={(element) => {
                collapseButtonRef.current = element;
                registerTrigger(metric.id, element);
              }}
            >
              <Icon
                name="chevronRight"
                size="xs"
                className={metricCollapseIconStyle}
                data-state={metric.expanded ? "open" : "closed"}
              />
            </button>
          </Collapsible.Trigger>
          <div className={metricTitleGroupStyle}>
            {isCustomMetric ? (
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
            ) : (
              <span className={metricTitleStyle} title={metricLabel}>
                {metricLabel}
              </span>
            )}
          </div>
          <Select
            required
            aria-label="Metric type"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- adding a metric explicitly moves focus into its row
            autoFocus={autoFocusLabel && metric.kind !== "expression"}
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
                  .flatMap((group) => group.items)
                  .find((item) => item.value === value)?.text ?? value;
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
          onClick={() => onRemove(metric.id)}
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
                    aria-label="Place"
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
                      aria-label="Transition"
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
                      aria-label="Count mode"
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
              readOnly={metric.sourceMetricId !== null}
              onChange={(code) => updateMetric({ code })}
              onEscape={() => collapseButtonRef.current?.focus()}
            />
          ) : null}
        </div>
      </Collapsible.Content>
      {footer}
    </Collapsible.Root>
  );
};
