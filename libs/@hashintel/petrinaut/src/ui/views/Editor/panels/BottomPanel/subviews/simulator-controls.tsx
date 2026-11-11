import { use } from "react";

import { NumberInput, Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  resolveSimulatorParameters,
  type SimulatorParameterSpec,
  type SimulatorRegistration,
} from "@hashintel/petrinaut-core";

import { SimulationContext } from "../../../../../../react/simulation/context";
import {
  findSimulator,
  SimulatorsContext,
} from "../../../../../../react/simulators/context";
import { PointerHelpTooltip } from "../../../../../components/pointer-help-tooltip";

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

/**
 * Why a simulator cannot compute a single run here, or null when it can.
 * Known from the registration alone, so the picker asks nothing of a
 * simulator it has not loaded.
 */
export const singleRunRefusal = (
  registration: SimulatorRegistration,
): string | null => {
  if (!registration.isAvailable()) {
    return "Not supported by this browser";
  }
  if (!registration.produces.run) {
    return "Computes many runs at once";
  }
  return null;
};

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
      {spec.type === "boolean" ? (
        <Toggle
          htmlForId={id}
          value={value === true}
          onChange={onChange}
          disabled={disabled}
        />
      ) : spec.type === "enum" ? (
        <Select
          htmlForId={id}
          size="xs"
          width="fitContent"
          required
          value={typeof value === "string" ? value : spec.default}
          items={spec.options.map((option) => ({
            value: option.value,
            text: option.label,
          }))}
          onChange={onChange}
          disabled={disabled}
        />
      ) : (
        <NumberInput
          htmlForId={id}
          size="xs"
          width="xs"
          min={spec.min}
          max={spec.max}
          step={spec.type === "integer" ? 1 : "any"}
          hideStepper
          value={typeof value === "number" ? value : spec.default}
          onChange={(next) => {
            if (next !== null) {
              onChange(next);
            }
          }}
          disabled={disabled}
        />
      )}
    </div>
  );
};

/**
 * Which simulator computes the next run, and the fields its parameter spec
 * declares. A simulator that cannot compute a single run is listed, greyed,
 * with the reason beside it.
 */
export const SimulatorControls: React.FC<{ disabled: boolean }> = ({
  disabled,
}) => {
  const { registrations } = use(SimulatorsContext);
  const { simulatorSelection, selectSimulator, setSimulatorParameter } =
    use(SimulationContext);
  const selected = findSimulator(registrations, simulatorSelection.simulatorId);

  const refusals = new Map(
    registrations.map((registration) => [
      registration.id,
      singleRunRefusal(registration),
    ]),
  );
  const items = registrations.map((registration) => ({
    value: registration.id,
    text: registration.label,
    disabled: refusals.get(registration.id) !== null,
  }));

  const parameters = selected
    ? Object.entries(selected.parameters).filter(([, spec]) => {
        const condition = spec.enabledWhen;
        if (!condition) {
          return true;
        }
        const controlling = simulatorSelection.parameters[condition.key];
        return (
          typeof controlling !== "number" &&
          controlling !== undefined &&
          condition.in.includes(controlling)
        );
      })
    : [];

  return (
    <>
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
    </>
  );
};
