import { TextInput, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useDraftField } from "../hooks/use-draft-field";

type ValidationResult =
  | { valid: true; name: string }
  | { valid: false; error: string };

interface DraftFieldInputProps {
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
  tooltip?: string;
}

const errorMessageStyle = css({
  fontSize: "xs",
  color: "red.s100",
});

const monospaceInputStyle = css({
  "& input": {
    fontFamily: "mono",
  },
});

/**
 * Standard text input bound to a {@link useDraftField} draft. Renders the
 * input, runs the validator on blur, surfaces the validation error
 * underneath, and commits only when the normalized value actually changes.
 */
export const DraftFieldInput: React.FC<DraftFieldInputProps> = ({
  sourceId,
  sourceValue,
  validate,
  onCommit,
  disabled = false,
  monospace = false,
  tooltip,
}) => {
  const field = useDraftField({ sourceId, sourceValue });

  return (
    <>
      <Tooltip content={tooltip ?? ""} disableTooltip={!tooltip}>
        <TextInput
          value={field.value}
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
      {field.error && <div className={errorMessageStyle}>{field.error}</div>}
    </>
  );
};
