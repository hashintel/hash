import { Form, TextInput, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useIsReadOnly } from "../../react/state/use-is-read-only";
import { useDraftField } from "../hooks/use-draft-field";
import { PropertyValue } from "./property-value";

type ValidationResult =
  | { valid: true; name: string }
  | { valid: false; error: string };

interface DraftFieldInputProps {
  /** Field label, rendered via Form.Field and connected to the input. */
  label: string;
  /** Optional info tooltip rendered next to the label. */
  labelTooltip?: string;
  /** Stable identifier of the entity owning this field; switching it discards stale drafts. */
  sourceId: string;
  /** Current canonical value. */
  sourceValue: string;
  /** Returns success + normalized name, or failure + error message. */
  validate: (draft: string) => ValidationResult;
  /** Called on blur when validation passes AND the normalized name differs from `sourceValue`. */
  onCommit: (name: string) => void;
  disabled?: boolean;
  monospace?: boolean;
  /** Tooltip shown when hovering the input itself (eg. a read-only hint). */
  tooltip?: string;
}

const monospaceInputStyle = css({
  "& input": {
    fontFamily: "mono",
  },
});

/**
 * Labelled text input bound to a {@link useDraftField} draft. Renders a
 * Form.Field around the input, runs the validator on blur, surfaces the
 * validation error via the field's error slot, and commits only when the
 * normalized value actually changes.
 */
export const DraftFieldInput: React.FC<DraftFieldInputProps> = ({
  label,
  labelTooltip,
  sourceId,
  sourceValue,
  validate,
  onCommit,
  disabled = false,
  monospace = false,
  tooltip,
}) => {
  const field = useDraftField({ sourceId, sourceValue });
  const isReadOnly = useIsReadOnly();

  return (
    <Form.Field
      label={label}
      labelTooltip={labelTooltip}
      size="sm"
      // A read-only field is not a disabled one: its label describes a value
      // the reader can read, so it keeps full contrast.
      disabled={disabled && !isReadOnly}
      // The error belongs to a draft the reader cannot see; showing it beside
      // the canonical value would contradict the value itself.
      errors={!isReadOnly && field.error ? [field.error] : undefined}
    >
      <PropertyValue text={sourceValue}>
        <Tooltip content={tooltip ?? ""} disableTooltip={!tooltip}>
          <TextInput
            value={field.value}
            size="sm"
            className={monospace ? monospaceInputStyle : undefined}
            onChange={(value) => {
              field.setValue(value);
              if (field.error) {
                field.setError(null);
              }
            }}
            onBlur={() => {
              const result = validate(field.value);

              if (!result.valid) {
                field.setError(result.error);
                return;
              }

              field.setError(null);
              if (result.name !== sourceValue) {
                onCommit(result.name);
              }
            }}
            disabled={disabled}
            invalid={!!field.error}
          />
        </Tooltip>
      </PropertyValue>
    </Form.Field>
  );
};
