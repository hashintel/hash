import { use } from "react";

import {
  NumberInput,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  resolveSimulatorParameters,
  type SimulatorParameterSpec,
} from "@hashintel/petrinaut-core";

import { SimulationContext } from "../../../../../../react/simulation/context";
import {
  findSimulator,
  simulatorRefusal,
  SimulatorsContext,
  type SimulationMode,
} from "../../../../../../react/simulators/context";
import { PointerHelpTooltip } from "../../../../../components/pointer-help-tooltip";
import {
  SimulatorParameterInput,
  visibleSimulatorParameters,
} from "../../../../../components/simulator-parameter-input";

export const inlineControlStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

export const labelStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  whiteSpace: "nowrap",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.fg.body",
});

export const smallLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "normal",
});

const itemReasonStyle = css({
  color: "neutral.fg.subtle",
});

const MODE_ITEMS: { value: SimulationMode; label: string }[] = [
  { value: "quick", label: "Quick simulation" },
  { value: "stochastic", label: "Stochastic" },
];

const fieldId = (simulatorId: string, key: string): string =>
  `simulator-${simulatorId}-${key}`;

const ParameterField: React.FC<{
  simulatorId: string;
  parameterKey: string;
  spec: SimulatorParameterSpec;
  value: number | boolean | string | undefined;
  disabled: boolean;
  /** Stores a value the spec accepts; one it rejects is not stored. */
  onChange: (value: number | boolean | string) => void;
}> = ({ simulatorId, parameterKey, spec, value, disabled, onChange }) => {
  const id = fieldId(simulatorId, parameterKey);
  const unit =
    spec.type === "number" && spec.unit ? (
      <span className={smallLabelStyle}>({spec.unit})</span>
    ) : null;

  return (
    <div className={inlineControlStyle}>
      <label htmlFor={id} className={labelStyle}>
        <span>
          {spec.label} {unit}
        </span>
        {spec.description ? (
          <PointerHelpTooltip content={spec.description} />
        ) : null}
      </label>
      <SimulatorParameterInput
        id={id}
        spec={spec}
        value={value}
        size="xs"
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
};

/**
 * What Play computes and with what: the mode, the simulator, the fields its
 * parameter spec declares, and for a Stochastic simulation how many runs
 * and until when. A simulator that cannot compute what the mode shows is
 * listed, greyed, with the reason beside it.
 */
export const SimulatorControls: React.FC<{ disabled: boolean }> = ({
  disabled,
}) => {
  const { registrations } = use(SimulatorsContext);
  const {
    mode,
    setMode,
    simulatorSelection,
    selectSimulator,
    setSimulatorParameter,
    runs,
    setRuns,
    maxTime,
    setMaxTime,
  } = use(SimulationContext);
  const selected = findSimulator(registrations, simulatorSelection.simulatorId);

  const refusals = new Map(
    registrations.map((registration) => [
      registration.id,
      simulatorRefusal(registration, mode),
    ]),
  );
  const items = registrations.map((registration) => ({
    value: registration.id,
    text: registration.label,
    disabled: refusals.get(registration.id) !== null,
  }));

  const parameters = selected
    ? visibleSimulatorParameters(
        selected.parameters,
        simulatorSelection.parameters,
      )
    : [];

  return (
    <>
      <div className={inlineControlStyle}>
        <span className={labelStyle}>
          <span>Mode</span>
          <PointerHelpTooltip content="Quick simulation computes one run and plays it on the canvas. Stochastic computes many runs and shows each place's token count across them." />
        </span>
        <SegmentedControl
          size="xs"
          aria-label="Simulation mode"
          value={mode}
          items={MODE_ITEMS}
          onChange={(next) => setMode(next as SimulationMode)}
          disabled={disabled}
        />
      </div>
      <div className={inlineControlStyle}>
        <span className={labelStyle}>
          <span>Simulator</span>
          <PointerHelpTooltip
            content={
              selected?.description ??
              "What computes the run. Each simulator takes its own parameters."
            }
          />
        </span>
        <Select
          size="xs"
          width="fitContent"
          required
          aria-label="Simulator"
          value={simulatorSelection.simulatorId}
          items={items}
          renderItem={(simulatorId) => {
            const registration = findSimulator(registrations, simulatorId);
            const refusal = refusals.get(simulatorId);
            return (
              <span>
                {registration?.label ?? simulatorId}
                {refusal ? (
                  <span className={itemReasonStyle}> · {refusal}</span>
                ) : null}
              </span>
            );
          }}
          onChange={selectSimulator}
          disabled={disabled}
        />
      </div>
      {selected
        ? parameters.map(([key, spec]) => (
            <ParameterField
              key={fieldId(selected.id, key)}
              simulatorId={selected.id}
              parameterKey={key}
              spec={spec}
              value={simulatorSelection.parameters[key]}
              disabled={disabled}
              onChange={(value) => {
                const candidate = resolveSimulatorParameters(
                  selected.parameters,
                  { ...simulatorSelection.parameters, [key]: value },
                );
                if (candidate.ok) {
                  setSimulatorParameter(key, value);
                }
              }}
            />
          ))
        : null}
      {mode === "stochastic" ? (
        <>
          <div className={inlineControlStyle}>
            <label htmlFor="stochastic-runs-input" className={labelStyle}>
              <span>Runs</span>
              <PointerHelpTooltip content="How many independent runs are computed. More runs give a steadier mean and a truer spread, and take longer." />
            </label>
            <NumberInput
              htmlForId="stochastic-runs-input"
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
              disabled={disabled}
            />
          </div>
          <div className={inlineControlStyle}>
            <label htmlFor="stochastic-end-time-input" className={labelStyle}>
              <span>
                End time <span className={smallLabelStyle}>(s)</span>
              </span>
              <PointerHelpTooltip content="The simulated time every run stops at. Runs are compared at the same times, so a Stochastic simulation needs an end." />
            </label>
            <NumberInput
              htmlForId="stochastic-end-time-input"
              size="xs"
              width="xs"
              min={0}
              step="any"
              hideStepper
              value={maxTime}
              onChange={(next) => {
                if (next !== null && next > 0) {
                  setMaxTime(next);
                }
              }}
              disabled={disabled}
            />
          </div>
        </>
      ) : null}
    </>
  );
};
