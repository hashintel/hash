import { NumberInput, Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { type SimulatorParameterSpec } from "@hashintel/petrinaut-core";

const unitStyle = css({
  fontWeight: "normal",
  color: "neutral.fg.subtle",
});

/** A parameter's name as a field's label reads, a number's unit after it. */
export const SimulatorParameterLabel: React.FC<{
  spec: SimulatorParameterSpec;
}> = ({ spec }) => (
  <>
    {spec.label}
    {spec.type === "number" && spec.unit ? (
      <span className={unitStyle}> ({spec.unit})</span>
    ) : null}
  </>
);

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
