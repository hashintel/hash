/**
 * The Parameters card's optimizer control, on the right of its header: one
 * purple button. At rest it reads Optimize and opens a small prompt: the
 * metric to optimize, the direction, the number of steps, Start. While a
 * study drives the sweep the same button reads Stop; the navigator's status
 * line beneath counts the steps.
 */
import { useRef, useState } from "react";

import {
  Button,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SWEEP_OPTIMIZATION_DEFAULT_STEPS } from "./create-experiment-drawer/sweep-objective";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { SweepOptimizer } from "./sweep-optimizer";
import type { PetrinautOptimizationDirection } from "@hashintel/petrinaut-core/optimization";

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
  value: PetrinautOptimizationDirection;
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
    useState<PetrinautOptimizationDirection>("maximize");
  const [steps, setSteps] = useState<number | null>(
    SWEEP_OPTIMIZATION_DEFAULT_STEPS,
  );
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const driving = optimizer.driving !== null;

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
      {driving ? (
        <Button
          className={optimizeButtonStyle}
          variant="subtle"
          tone="neutral"
          size="xs"
          iconName="stop"
          tooltip="Stop optimizing; the sweep keeps its point"
          data-sweep-optimizing
          onClick={optimizer.stop}
        >
          Stop
        </Button>
      ) : (
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
      )}
      {open && !driving ? (
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
                  setDirection(value as PetrinautOptimizationDirection)
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
