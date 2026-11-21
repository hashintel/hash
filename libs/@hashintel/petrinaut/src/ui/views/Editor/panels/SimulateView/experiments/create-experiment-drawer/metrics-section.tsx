import {
  type Dispatch,
  type SetStateAction,
  useId,
  useRef,
  useState,
} from "react";

import { Button, Checkbox, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useSDCPNState } from "../../../../../../../react/state/sdcpn-context";
import { Section } from "../../../../../../components/section";
import { FocusControls } from "../../../../../../worksheet/focus-controls";
import { createMetricKindGroups } from "../../metrics/metric-picker-options";
import {
  createDefaultMetricDraft,
  getMetricLabel,
  type ExperimentMetricDraft,
} from "./metric-drafts";
import {
  MetricObjectiveControl,
  OptimizationBudget,
} from "./metric-optimization";
import { ExperimentMetricRow } from "./metric-row";

import type { SweepObjectiveDraft } from "../shared/sweep-objective";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});

const countStyle = css({
  fontSize: "sm",
  color: "neutral.s80",
});

/**
 * The experiment's metrics: the rows, adding and removing them, and, while a
 * sweep can be optimized, which metric the optimizer reads and for how long.
 */
export const MetricsSection = ({
  drafts,
  onChange,
  optimizationAvailable,
  startOptimizerImmediately,
  onStartOptimizerImmediatelyChange,
  objectiveDraft,
  objectiveMetricId,
  objectiveError,
  onObjectiveChange,
  disabled,
}: {
  drafts: ExperimentMetricDraft[];
  onChange: (
    update: (drafts: ExperimentMetricDraft[]) => ExperimentMetricDraft[],
  ) => void;
  /** Whether the form defines a sweep an optimizer could take. */
  optimizationAvailable: boolean;
  startOptimizerImmediately: boolean;
  onStartOptimizerImmediatelyChange: (start: boolean) => void;
  objectiveDraft: SweepObjectiveDraft;
  /** The draft's metric resolved against the rows that exist. */
  objectiveMetricId: string | null;
  objectiveError: string | null;
  onObjectiveChange: Dispatch<SetStateAction<SweepObjectiveDraft>>;
  disabled: boolean;
}) => {
  const petriNetDefinition = useSDCPNState(
    (document) => document.petriNetDefinition,
  );
  const objectiveGroupName = useId();
  // The row added last takes focus at its label as it mounts.
  const [labelFocusId, setLabelFocusId] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const triggersRef = useRef(new Map<string, HTMLButtonElement>());

  const kindGroups = createMetricKindGroups(petriNetDefinition);
  const objectiveEnabled = optimizationAvailable && startOptimizerImmediately;

  const handleAdd = () => {
    const nextMetric = createDefaultMetricDraft(petriNetDefinition);

    setLabelFocusId(nextMetric.id);
    onChange((prev) => [
      ...prev.map((metric) => ({ ...metric, expanded: false })),
      nextMetric,
    ]);
  };

  const handleChange = (
    metricId: string,
    patch: Partial<ExperimentMetricDraft>,
  ) => {
    onChange((prev) =>
      prev.map((metric) =>
        metric.id === metricId ? { ...metric, ...patch } : metric,
      ),
    );
  };

  const handleRemove = (metricId: string) => {
    const index = drafts.findIndex((metric) => metric.id === metricId);
    const nextMetric = drafts[index + 1] ?? drafts[index - 1];
    onChange((prev) => prev.filter((metric) => metric.id !== metricId));
    if (nextMetric) {
      triggersRef.current.get(nextMetric.id)?.focus();
    } else {
      addButtonRef.current?.focus();
    }
  };

  const registerTrigger = (
    metricId: string,
    element: HTMLButtonElement | null,
  ) => {
    if (element) {
      triggersRef.current.set(metricId, element);
    } else {
      triggersRef.current.delete(metricId);
    }
  };

  return (
    <Section
      title={objectiveEnabled ? "Metrics & objective" : "Metrics"}
      collapsible
      defaultOpen
    >
      <FocusControls>
        <div className={listStyle}>
          {optimizationAvailable ? (
            <Checkbox
              size="sm"
              label="Start optimizer immediately"
              value={startOptimizerImmediately}
              onChange={onStartOptimizerImmediatelyChange}
              disabled={disabled}
            />
          ) : null}
          <div className={headerStyle}>
            <span className={countStyle}>
              {drafts.length === 0
                ? objectiveEnabled
                  ? "Add a metric to optimize"
                  : "No experiment metrics"
                : `${drafts.length} experiment metric${
                    drafts.length === 1 ? "" : "s"
                  }`}
            </span>
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              prefix={<Icon name="plus" size="sm" />}
              onClick={handleAdd}
              ref={addButtonRef}
            >
              Add metric
            </Button>
          </div>

          {drafts.map((metric) => (
            <ExperimentMetricRow
              key={metric.id}
              metric={metric}
              sdcpn={petriNetDefinition}
              kindGroups={kindGroups}
              autoFocusLabel={metric.id === labelFocusId}
              isObjective={objectiveEnabled && metric.id === objectiveMetricId}
              onChange={handleChange}
              onRemove={handleRemove}
              registerTrigger={registerTrigger}
              footer={
                objectiveEnabled ? (
                  <MetricObjectiveControl
                    metricId={metric.id}
                    metricLabel={getMetricLabel(metric, petriNetDefinition)}
                    groupName={objectiveGroupName}
                    direction={
                      metric.id === objectiveMetricId
                        ? objectiveDraft.direction
                        : null
                    }
                    disabled={disabled}
                    onSelect={() =>
                      onObjectiveChange((draft) => ({
                        ...draft,
                        metricId: metric.id,
                      }))
                    }
                    onDirectionChange={(direction) =>
                      onObjectiveChange((draft) => ({ ...draft, direction }))
                    }
                  />
                ) : undefined
              }
            />
          ))}

          {objectiveEnabled && drafts.length > 0 ? (
            <OptimizationBudget
              steps={objectiveDraft.steps}
              error={objectiveError}
              onChange={(steps) =>
                onObjectiveChange((draft) => ({ ...draft, steps }))
              }
              disabled={disabled}
            />
          ) : null}
        </div>
      </FocusControls>
    </Section>
  );
};
