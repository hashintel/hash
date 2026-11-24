import { NumberInput, TextInput } from "@hashintel/ds-components";

import { Section } from "../../../../../../../shared/section";
import { FocusControls } from "../../../../../../../worksheet/focus-controls";
import { fieldStyle, gridStyle, labelStyle } from "./form-field-styles";

import type { RunClock } from "@hashintel/petrinaut-core";
import type { ReactNode, RefObject } from "react";

/**
 * The experiment's own properties: its name, how many runs, and where each
 * run ends. `children` are further cells of the grid of Runs and Max time.
 */
export const ExperimentSection = ({
  name,
  onNameChange,
  nameInputRef,
  runCount,
  onRunCountChange,
  maxTime,
  onMaxTimeChange,
  sweeping,
  clock,
  children,
}: {
  name: string;
  onNameChange: (name: string) => void;
  nameInputRef: RefObject<HTMLInputElement | null>;
  runCount: number | null;
  onRunCountChange: (runCount: number | null) => void;
  maxTime: number | null;
  onMaxTimeChange: (maxTime: number | null) => void;
  /** Whether the form defines a sweep, whose selections share the runs. */
  sweeping: boolean;
  /** What the net's runs count: an untimed net's end at a step. */
  clock: RunClock;
  children: ReactNode;
}) => {
  const inSteps = clock === "steps";

  return (
    <Section title="Experiment" collapsible defaultOpen>
      <FocusControls>
        <div className={fieldStyle}>
          <label className={labelStyle} htmlFor="experiment-name">
            Name
          </label>
          <TextInput
            htmlForId="experiment-name"
            inputRef={nameInputRef}
            aria-label="Experiment name"
            size="sm"
            value={name}
            onChange={onNameChange}
          />
        </div>
      </FocusControls>
      <FocusControls axis="horizontal">
        <div className={gridStyle}>
          <div className={fieldStyle}>
            {/* A sweep refines each selection progressively (8, 25, 100, ...
                1000, 5000, ...) up to this budget, so for sweeps this is a
                ceiling, not a batch size — 100,000 is a reasonable value on
                the GPU. */}
            <label className={labelStyle} htmlFor="experiment-runs">
              {sweeping ? "Max runs per selection" : "Runs"}
            </label>
            <NumberInput
              htmlForId="experiment-runs"
              size="sm"
              min={1}
              value={runCount}
              onChange={onRunCountChange}
            />
          </div>
          <div className={fieldStyle}>
            <label
              className={labelStyle}
              htmlFor="experiment-max-time"
              title={
                inSteps
                  ? "This net is untimed: its runs are fired step by step, and every step is sampled."
                  : undefined
              }
            >
              {inSteps ? "End at step" : "Max time (s)"}
            </label>
            <NumberInput
              htmlForId="experiment-max-time"
              aria-label={
                inSteps ? "Step the runs end at" : "Max time (seconds)"
              }
              size="sm"
              min={inSteps ? 1 : 0}
              step={inSteps ? 1 : "any"}
              value={maxTime}
              onChange={onMaxTimeChange}
            />
          </div>
          {children}
        </div>
      </FocusControls>
    </Section>
  );
};
