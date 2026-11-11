import { NumberInput, Select, Toggle } from "@hashintel/ds-components";

import type {
  SimulatorParameterSpec,
  SimulatorParameterSpecs,
  StoredSimulatorParameters,
} from "@hashintel/petrinaut-core";

/**
 * The parameters of a spec a form shows for the values it holds: every one
 * whose `enabledWhen` condition those values meet, in the spec's order.
 */
export const visibleSimulatorParameters = (
  specs: SimulatorParameterSpecs,
  values: StoredSimulatorParameters,
): [string, SimulatorParameterSpec][] =>
  Object.entries(specs).filter(([, spec]) => {
    const condition = spec.enabledWhen;
    if (!condition) {
      return true;
    }
    const controlling = values[condition.key];
    return (
      typeof controlling !== "number" &&
      controlling !== undefined &&
      condition.in.includes(controlling)
    );
  });

/**
 * The control a parameter spec asks for: a toggle, a select or a number
 * field. `xs` is the dense form of a toolbar row, sized to its content;
 * `sm` fills a form's cell. The label is the caller's.
 */
export const SimulatorParameterInput: React.FC<{
  id: string;
  spec: SimulatorParameterSpec;
  /** The stored value; the spec's default shows when there is none. */
  value: number | boolean | string | undefined;
  size: "xs" | "sm";
  disabled?: boolean;
  onChange: (value: number | boolean | string) => void;
}> = ({ id, spec, value, size, disabled = false, onChange }) => {
  if (spec.type === "boolean") {
    return (
      <Toggle
        htmlForId={id}
        value={typeof value === "boolean" ? value : spec.default}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  if (spec.type === "enum") {
    return (
      <Select
        htmlForId={id}
        size={size}
        {...(size === "xs" ? { width: "fitContent" as const } : {})}
        required
        value={typeof value === "string" ? value : spec.default}
        items={spec.options.map((option) => ({
          value: option.value,
          text: option.label,
        }))}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  return (
    <NumberInput
      htmlForId={id}
      size={size}
      {...(size === "xs" ? { width: "xs" as const, hideStepper: true } : {})}
      min={spec.min}
      max={spec.max}
      step={spec.type === "integer" ? 1 : "any"}
      value={typeof value === "number" ? value : spec.default}
      onChange={(next) => {
        if (next !== null) {
          onChange(next);
        }
      }}
      disabled={disabled}
    />
  );
};
