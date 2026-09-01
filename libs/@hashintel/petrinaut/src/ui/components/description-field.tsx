import { Form, TextArea, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useDraftField } from "../hooks/use-draft-field";

interface DescriptionTextAreaProps {
  /** Stable identifier of the entity owning this field; switching it discards stale drafts. */
  sourceId: string;
  /** Current canonical description. */
  sourceValue: string | undefined;
  /** Called on blur when the draft differs from `sourceValue`; an empty draft passes `undefined`. */
  onCommit: (description: string | undefined) => void;
  disabled?: boolean;
  /** Tooltip shown when hovering the textarea itself (eg. a read-only hint). */
  tooltip?: string;
}

const textAreaStyle = css({
  minHeight: "[64px]",
});

/**
 * Description textarea bound to a {@link useDraftField} draft, for hosts that
 * render their own label (eg. a Section title).
 */
export const DescriptionTextArea: React.FC<DescriptionTextAreaProps> = ({
  sourceId,
  sourceValue,
  onCommit,
  disabled = false,
  tooltip,
}) => {
  const canonicalValue = sourceValue ?? "";
  const field = useDraftField({ sourceId, sourceValue: canonicalValue });

  return (
    <Tooltip content={tooltip ?? ""} disableTooltip={!tooltip}>
      <TextArea
        className={textAreaStyle}
        size="sm"
        value={field.value}
        onChange={field.setValue}
        onBlur={() => {
          if (field.value !== canonicalValue) {
            onCommit(field.value === "" ? undefined : field.value);
          }
        }}
        disabled={disabled}
      />
    </Tooltip>
  );
};

/**
 * Labelled description textarea for panels laid out with Form fields.
 */
export const DescriptionField: React.FC<DescriptionTextAreaProps> = ({
  disabled = false,
  ...textAreaProps
}) => (
  <Form.Field label="Description" size="sm" disabled={disabled}>
    <DescriptionTextArea {...textAreaProps} disabled={disabled} />
  </Form.Field>
);
