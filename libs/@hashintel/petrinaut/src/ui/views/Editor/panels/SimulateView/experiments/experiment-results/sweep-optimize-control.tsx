import { useRef, useState } from "react";

import {
  Button,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { PETRINAUT_OPTIMIZATION_MAX_TRIALS } from "@hashintel/petrinaut-core/optimization";

import {
  EMPTY_SWEEP_OBJECTIVE,
  resolveObjectiveMetricId,
  sweepObjectiveError,
  sweepObjectiveFor,
} from "../shared/sweep-objective";
import { SWEEP_OPTIMIZATION_RUNS_PER_STEP } from "../sweep-optimizer";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";
import type { SweepObjective } from "../sweep-optimizer";
import type { PetrinautOptimizationDirection } from "@hashintel/petrinaut-core/optimization";

const buttonStyle = css({
  color: "purple.s110",
  backgroundColor: "purple.s10",
  borderColor: "purple.s60",
  flexShrink: "0",
  _hover: { backgroundColor: "purple.s20", borderColor: "purple.s80" },
});

const formStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto minmax(0, 1fr)]",
  alignItems: "center",
  columnGap: "3",
  rowGap: "3",
  width: "[300px]",
  maxWidth: "[calc(100vw - 32px)]",
  padding: "3",
  fontSize: "xs",
});

const errorStyle = css({
  gridColumn: "[1 / -1]",
  color: "red.s100",
});

const directionItems: {
  value: PetrinautOptimizationDirection;
  label: string;
}[] = [
  { value: "maximize", label: "Maximize" },
  { value: "minimize", label: "Minimize" },
];

export const SweepOptimizeControl = ({
  experiment,
  onStart,
}: {
  experiment: ExperimentRecord;
  onStart: (objective: SweepObjective) => Promise<void>;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_SWEEP_OBJECTIVE);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metricId = resolveObjectiveMetricId(draft, experiment.metricSpecs);
  const execution = {
    dt: experiment.dt,
    maxTime: experiment.maxTime,
    runsPerStep: SWEEP_OPTIMIZATION_RUNS_PER_STEP,
  };
  const validationError = sweepObjectiveError(draft, metricId, execution);
  const displayedError = error ?? validationError;

  const start = async () => {
    const objective = sweepObjectiveFor(draft, metricId, execution);
    if (objective === null || starting) {
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await onStart(objective);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    setStarting(false);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        className={buttonStyle}
        variant="subtle"
        tone="neutral"
        size="xs"
        iconName="sparkles"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={starting}
        onClick={() => setOpen((previous) => !previous)}
      >
        Optimize
      </Button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          onClose={() => setOpen(false)}
        >
          <Popover.Container>
            <Popover.Header title="Optimize this sweep" />
            <div className={formStyle}>
              <span>Metric</span>
              <Select
                required
                size="sm"
                aria-label="Metric to optimize"
                items={experiment.metricSpecs.map((metric) => ({
                  value: metric.id,
                  text: metric.label,
                }))}
                value={metricId ?? ""}
                disabled={starting}
                onChange={(selectedMetricId) => {
                  setError(null);
                  setDraft((current) => ({
                    ...current,
                    metricId: selectedMetricId,
                  }));
                }}
              />
              <span>Direction</span>
              <SegmentedControl
                size="xs"
                aria-label="Direction"
                items={directionItems}
                value={draft.direction}
                disabled={starting}
                onChange={(direction) => {
                  setError(null);
                  setDraft((current) => ({ ...current, direction }));
                }}
              />
              <span>Steps</span>
              <NumberInput
                size="sm"
                aria-label="Optimization steps"
                value={draft.steps}
                min={1}
                max={PETRINAUT_OPTIMIZATION_MAX_TRIALS}
                step={1}
                disabled={starting}
                onChange={(steps) => {
                  setError(null);
                  setDraft((current) => ({ ...current, steps }));
                }}
              />
              {displayedError ? (
                <span className={errorStyle} role="alert">
                  {displayedError}
                </span>
              ) : null}
            </div>
            <Popover.Footer
              actions={
                <Button
                  variant="solid"
                  tone="neutral"
                  size="sm"
                  loading={starting}
                  disabled={starting || validationError !== null}
                  onClick={() => void start()}
                >
                  Start
                </Button>
              }
            />
          </Popover.Container>
        </Popover>
      ) : null}
    </>
  );
};
