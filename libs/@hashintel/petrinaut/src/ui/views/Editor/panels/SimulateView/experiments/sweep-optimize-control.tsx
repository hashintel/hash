/**
 * The Parameters card's optimizer control, on the right of its header. At
 * rest, an Optimize button opening a small prompt: the metric to optimize,
 * the direction, the number of steps, Start. While a study drives the sweep,
 * a chip counting its steps and a Stop button.
 */
import { useRef, useState } from "react";

import {
  Button,
  Chip,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  SWEEP_OPTIMIZATION_DEFAULT_STEPS,
  type SweepOptimizationDirection,
  type SweepOptimizer,
  studyStepProgress,
} from "./sweep-optimizer";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

// The ds Button has no purple tone; the optimizer's button wears the
// optimizing purple over the subtle variant.
const optimizeButtonStyle = css({
  color: "purple.s110",
  backgroundColor: "purple.s10",
  borderColor: "purple.s60",
  flexShrink: "0",
  "&:not([aria-disabled=true]):hover": {
    backgroundColor: "purple.s20",
    borderColor: "purple.s80",
  },
});

const runningStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flexShrink: "0",
});

const formStyle = css({
  display: "grid",
  gridTemplateColumns: "[auto minmax(0, 1fr)]",
  alignItems: "center",
  columnGap: "3",
  rowGap: "2",
  width: "[280px]",
  padding: "3",
});

const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  whiteSpace: "nowrap",
});

const errorStyle = css({
  gridColumn: "[1 / -1]",
  fontSize: "xs",
  color: "red.s100",
});

const DIRECTION_OPTIONS: {
  value: SweepOptimizationDirection;
  label: string;
}[] = [
  { value: "maximize", label: "Maximize" },
  { value: "minimize", label: "Minimize" },
];

export const SweepOptimizeControl = ({
  experiment,
  optimizer,
}: {
  experiment: ExperimentRecord;
  optimizer: SweepOptimizer;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [metricId, setMetricId] = useState(experiment.metricSpecs[0]?.id ?? "");
  const [direction, setDirection] =
    useState<SweepOptimizationDirection>("maximize");
  const [steps, setSteps] = useState<number | null>(
    SWEEP_OPTIMIZATION_DEFAULT_STEPS,
  );
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (optimizer.driving && optimizer.study) {
    const progress = studyStepProgress(optimizer.study);
    return (
      <span className={runningStyle} data-sweep-optimizing>
        <Chip
          size="xs"
          color="purple"
          variant="soft"
          prefix={{ loading: true }}
        >
          Optimizing · step {progress.step} of {progress.total}
        </Chip>
        <Button
          variant="ghost"
          size="xs"
          iconName="stop"
          aria-label="Stop optimizing"
          tooltip="Stop optimizing"
          onClick={optimizer.stop}
        />
      </span>
    );
  }

  const start = async () => {
    if (steps === null || steps < 1) {
      setError("Ask for at least one step");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await optimizer.start({ metricId, direction, steps });
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
        className={optimizeButtonStyle}
        variant="subtle"
        tone="neutral"
        size="xs"
        iconName="sparkles"
        aria-expanded={open}
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
            <div className={formStyle} data-sweep-optimize-prompt>
              <span className={labelStyle}>Metric</span>
              <Select
                size="xs"
                aria-label="Metric to optimize"
                items={experiment.metricSpecs.map((spec) => ({
                  value: spec.id,
                  text: spec.label,
                }))}
                value={metricId}
                onChange={(value) => setMetricId(value ?? "")}
              />
              <span className={labelStyle}>Direction</span>
              <SegmentedControl
                size="xs"
                aria-label="Direction"
                items={DIRECTION_OPTIONS}
                value={direction}
                onChange={(value) =>
                  setDirection(value as SweepOptimizationDirection)
                }
              />
              <span className={labelStyle}>Steps</span>
              <NumberInput
                size="sm"
                aria-label="Optimization steps"
                min={1}
                max={1000}
                step={1}
                value={steps}
                onChange={(value) => setSteps(value)}
              />
              {error === null ? null : (
                <span className={errorStyle} role="alert">
                  {error}
                </span>
              )}
            </div>
            <Popover.Footer
              actions={
                <Button
                  variant="solid"
                  tone="neutral"
                  size="sm"
                  iconName="sparkles"
                  loading={starting}
                  disabled={metricId === ""}
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
