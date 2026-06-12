import { Form, TextInput, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useDraftField } from "../hooks/use-draft-field";

type ValidationResult =
  | { valid: true; name: string }
  | { valid: false; error: string };

interface DraftFieldInputProps {
  /** Field label rendered above the input. */
  label: React.ReactNode;
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
  /** Tooltip shown when hovering the input itself (e.g. to explain a disabled state). */
  tooltip?: string;
  /** Tooltip shown as a help icon next to the label. */
  labelTooltip?: string;
}

const monospaceInputStyle = css({
  "& input": {
    fontFamily: "mono",
  },
});

/**
 * Standard form field bound to a {@link useDraftField} draft. Renders a
 * labelled text input, runs the validator on blur, surfaces the validation
 * error underneath, and commits only when the normalized value actually
 * changes.
 */
export const DraftFieldInput: React.FC<DraftFieldInputProps> = ({
  label,
  sourceId,
  sourceValue,
  validate,
  onCommit,
  disabled = false,
  monospace = false,
  tooltip,
  labelTooltip,
}) => {
  const field = useDraftField({ sourceId, sourceValue });

  return (
    <Form.Field
      label={label}
      size="sm"
      disabled={disabled}
      labelTooltip={labelTooltip}
      errors={field.error ? [field.error] : undefined}
    >
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
    </Form.Field>
  );
};
