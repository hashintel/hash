import { useLayoutEffect, useRef } from "react";

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

const minHeight = 64;
const initialMaxHeight = 100;

const textAreaStyle = css({
  minHeight: `[${minHeight}px]`,
});

/**
 * Description textarea bound to a {@link useDraftField} draft.
 * {@link DescriptionField} wraps it with a "Description" label.
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
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textArea = textAreaRef.current;
    // The box around the textarea carries the resize handle, so its inline
    // height is what a drag writes and what the initial fit sets.
    const box = textArea?.parentElement;
    if (!textArea || !box) {
      return;
    }
    box.style.height = "";
    const borderHeight = box.offsetHeight - box.clientHeight;
    const contentHeight = textArea.scrollHeight + borderHeight;
    box.style.height = `${Math.min(Math.max(contentHeight, minHeight), initialMaxHeight)}px`;
  }, [sourceId]);

  return (
    <Tooltip content={tooltip ?? ""} disableTooltip={!tooltip}>
      <TextArea
        inputRef={textAreaRef}
        className={textAreaStyle}
        size="sm"
        rows={1}
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
