import { use } from "react";

import { Icon, NumberInput, Popover } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../../../../../react/simulation/context";
import {
  acceptsRunEnd,
  runEndOf,
} from "../../../../../../../react/simulation/run-end";
import {
  findSimulator,
  simulatorRefusal,
  SimulatorsContext,
} from "../../../../../../../react/simulators/context";
import { PointerHelpTooltip } from "../../../../../../components/pointer-help-tooltip";
import {
  acceptsSimulatorParameter,
  SimulatorParameterInput,
  SimulatorParameterLabel,
  visibleSimulatorParameters,
} from "../../../../../../components/simulator-parameter-input";

const containerStyle = css({
  width: "[320px]",
});

const sectionStyle = css({
  padding: "1 !important",
  paddingTop: "0 !important",
});

const sectionLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  paddingX: "2",
  paddingTop: "2",
  paddingBottom: "1.5",
});

const simulatorItemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    width: "[100%]",
    paddingX: "2",
    paddingY: "1.5",
    borderRadius: "lg",
    border: "none",
    backgroundColor: "[transparent]",
    color: "neutral.s120",
    textAlign: "left",
    cursor: "pointer",
    _hover: { backgroundColor: "neutral.s10" },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.s20",
        _hover: { backgroundColor: "blue.s20" },
      },
    },
    unavailable: {
      true: {
        cursor: "not-allowed",
        _hover: { backgroundColor: "[transparent]" },
      },
    },
  },
  compoundVariants: [
    {
      selected: true,
      unavailable: true,
      css: { _hover: { backgroundColor: "blue.s20" } },
    },
  ],
});

const simulatorTextStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  flex: "[1]",
  minWidth: "0",
});

const simulatorLabelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  "[aria-disabled=true] &": { opacity: "[0.45]" },
});

const simulatorDescriptionStyle = css({
  fontSize: "xs",
  lineHeight: "[1.35]",
  color: "neutral.fg.subtle",
});

const checkIconStyle = css({
  flexShrink: 0,
  color: "blue.s50",
});

const fieldsStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  alignItems: "center",
  columnGap: "3",
  rowGap: "1.5",
  paddingX: "2",
  paddingBottom: "2",
});

const fieldLabelStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  minWidth: "0",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const unitStyle = css({
  fontWeight: "normal",
  color: "neutral.fg.subtle",
});

const steppedNoteStyle = css({
  paddingX: "3",
  paddingTop: "2",
  paddingBottom: "1",
  fontSize: "xs",
  lineHeight: "[1.4]",
  color: "neutral.fg.subtle",
});

const lockedNoteStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  paddingX: "3",
  paddingY: "2",
  fontSize: "xs",
  color: "neutral.fg.subtle",
});

/** Which way an arrow key moves through the simulators. */
const ARROW_STEPS: Readonly<Record<string, 1 | -1>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

const RUNS_ID = "run-settings-runs";
const END_TIME_ID = "run-settings-end-time";

/**
 * What the run settings picker opens: the simulators to pick from, each with
 * what it does or why it cannot compute what the mode shows, then the fields
 * the picked one declares, and for a Stochastic simulation how many runs and
 * until when. While a simulation exists everything here is read, not edited.
 */
export const RunSettingsPopoverContent: React.FC<{
  locked: boolean;
  /** Set to the picked simulator's radio, for the popover to focus. */
  pickedSimulatorRef?: React.Ref<HTMLButtonElement>;
}> = ({ locked, pickedSimulatorRef }) => {
  const { registrations } = use(SimulatorsContext);
  const {
    mode,
    clock,
    simulatorSelection,
    selectSimulator,
    setSimulatorParameter,
    runs,
    setRuns,
    maxTime,
    setMaxTime,
  } = use(SimulationContext);
  const selected = findSimulator(registrations, simulatorSelection.simulatorId);
  const inSteps = clock === "steps";
  // A simulator's parameters say how it advances time, which a run in steps
  // has none of.
  const parameters =
    selected && !inSteps
      ? visibleSimulatorParameters(
          selected.parameters,
          simulatorSelection.parameters,
        )
      : [];
  const hasFields = parameters.length > 0 || mode === "stochastic";
  const pickable = locked
    ? []
    : registrations.filter(
        (registration) => simulatorRefusal(registration, mode) === null,
      );
  // One tab stop for the group, on the picked simulator; the arrow keys move
  // through the ones that can be picked, and pick as they move.
  const tabStopId = selected?.id ?? registrations[0]?.id;
  const onArrowKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = ARROW_STEPS[event.key];
    if (step === undefined || pickable.length === 0) {
      return;
    }
    event.preventDefault();
    const from = pickable.findIndex(({ id }) => id === selected?.id);
    const next =
      pickable[
        from === -1
          ? step === 1
            ? 0
            : pickable.length - 1
          : (from + step + pickable.length) % pickable.length
      ];
    if (!next) {
      return;
    }
    selectSimulator(next.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLElement>('[role="radio"]')
      [registrations.indexOf(next)]?.focus();
  };

  // The container takes a list of panels, so an absent one is left out of
  // the list rather than rendered as nothing.
  const simulatorsPanel = (
    <Popover.Body key="simulators" className={sectionStyle}>
      <div role="radiogroup" aria-label="Simulator">
        {registrations.map((registration) => {
          const refusal = simulatorRefusal(registration, mode);
          const isSelected = registration.id === selected?.id;
          const unavailable = locked || refusal !== null;
          return (
            <button
              key={registration.id}
              ref={
                registration.id === tabStopId ? pickedSimulatorRef : undefined
              }
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={unavailable}
              tabIndex={registration.id === tabStopId ? 0 : -1}
              onKeyDown={onArrowKey}
              className={simulatorItemStyle({
                selected: isSelected,
                unavailable,
              })}
              onClick={() => {
                if (!unavailable) {
                  selectSimulator(registration.id);
                }
              }}
            >
              <span className={simulatorTextStyle}>
                <span className={simulatorLabelStyle}>
                  {registration.label}
                </span>
                <span className={simulatorDescriptionStyle}>
                  {refusal ?? registration.description}
                </span>
              </span>
              {isSelected ? (
                <Icon name="check" size="sm" className={checkIconStyle} />
              ) : null}
            </button>
          );
        })}
      </div>
    </Popover.Body>
  );
  const fieldsPanel = (
    <Popover.Body key="fields" className={sectionStyle}>
      <div className={sectionLabelStyle}>Parameters</div>
      <div className={fieldsStyle}>
        {selected
          ? parameters.map(([key, spec]) => {
              const id = `run-settings-${selected.id}-${key}`;
              return [
                <label key={`${id}-label`} htmlFor={id}>
                  <span className={fieldLabelStyle}>
                    <span>
                      <SimulatorParameterLabel spec={spec} />
                    </span>
                    {spec.description ? (
                      <PointerHelpTooltip content={spec.description} />
                    ) : null}
                  </span>
                </label>,
                <SimulatorParameterInput
                  key={id}
                  id={id}
                  spec={spec}
                  value={simulatorSelection.parameters[key]}
                  size="xs"
                  disabled={locked}
                  onChange={(value) => {
                    if (
                      acceptsSimulatorParameter(
                        selected.parameters,
                        simulatorSelection.parameters,
                        key,
                        value,
                      )
                    ) {
                      setSimulatorParameter(key, value);
                    }
                  }}
                />,
              ];
            })
          : null}
        {mode === "stochastic" ? (
          <>
            <label htmlFor={RUNS_ID}>
              <span className={fieldLabelStyle}>
                <span>Runs</span>
                <PointerHelpTooltip content="How many independent runs are computed. More runs give a steadier mean and a truer spread, and take longer." />
              </span>
            </label>
            <NumberInput
              htmlForId={RUNS_ID}
              size="xs"
              width="xs"
              min={1}
              step={1}
              hideStepper
              value={runs}
              onChange={(next) => {
                if (next !== null && Number.isInteger(next) && next >= 1) {
                  setRuns(next);
                }
              }}
              disabled={locked}
            />
            <label htmlFor={END_TIME_ID}>
              <span className={fieldLabelStyle}>
                {inSteps ? (
                  <span>End at step</span>
                ) : (
                  <span>
                    End time<span className={unitStyle}> (s)</span>
                  </span>
                )}
                <PointerHelpTooltip
                  content={
                    inSteps
                      ? "The step every run stops at. Runs are compared at the same steps, so a Stochastic simulation needs an end."
                      : "The simulated time every run stops at. Runs are compared at the same times, so a Stochastic simulation needs an end."
                  }
                />
              </span>
            </label>
            <NumberInput
              htmlForId={END_TIME_ID}
              size="xs"
              width="xs"
              min={inSteps ? 1 : 0}
              step={inSteps ? 1 : "any"}
              hideStepper
              value={maxTime === null ? null : runEndOf(clock, maxTime)}
              onChange={(next) => {
                if (next !== null && acceptsRunEnd(clock, next)) {
                  setMaxTime(next);
                }
              }}
              disabled={locked}
            />
          </>
        ) : null}
      </div>
    </Popover.Body>
  );
  const steppedPanel = (
    <Popover.Body key="stepped" className={sectionStyle}>
      <div role="note" className={steppedNoteStyle}>
        This net is untimed: no transition has a stochastic rate and no place
        has dynamics.{" "}
        {mode === "quick"
          ? "A Quick simulation fires it step by step, and the simulator below is not used."
          : "A Stochastic simulation fires every run step by step. The simulator below computes the runs, and its parameters are not used."}
      </div>
    </Popover.Body>
  );
  const lockedPanel = (
    <Popover.Body key="locked" className={sectionStyle}>
      <div className={lockedNoteStyle}>
        <Icon name="lockClosed" size="xs" />
        Reset the simulation to change these.
      </div>
    </Popover.Body>
  );

  return (
    <Popover.Container className={containerStyle}>
      {[
        <Popover.Header key="header" title="Simulator" />,
        ...(inSteps ? [steppedPanel] : []),
        simulatorsPanel,
        ...(hasFields ? [fieldsPanel] : []),
        ...(locked ? [lockedPanel] : []),
      ]}
    </Popover.Container>
  );
};
