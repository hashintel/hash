import { type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useIsReadOnly } from "../../react/state/use-is-read-only";

const valueStyle = css({
  fontSize: "sm",
  lineHeight: "[1.45]",
  color: "neutral.fg.body",
  // Descriptions carry the line breaks their author typed.
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

const emptyValueStyle = css({
  fontSize: "sm",
  lineHeight: "[1.45]",
  color: "neutral.s95",
});

export interface PropertyValueProps {
  /**
   * The value as the reader should see it. `undefined` and a blank string
   * both render {@link PropertyValueProps.emptyText}.
   */
  text: string | undefined | null;
  /** Stands in for a value the net does not carry. */
  emptyText?: string;
  /** The control that edits this value while the net is editable. */
  children: ReactNode;
}

/**
 * One property's value: the control that edits it on an editable net, and the
 * value as text on a read-only one.
 *
 * A disabled input reads as something to click that refuses to respond, and
 * greys the value down while doing it. The same value as text reads as what it
 * is, a fact about the net.
 */
export const PropertyValue = ({
  text,
  emptyText = "None",
  children,
}: PropertyValueProps) => {
  const isReadOnly = useIsReadOnly();

  if (!isReadOnly) {
    return children;
  }

  // Trimmed only to decide whether anything is there: the value renders as
  // authored, because `pre-wrap` is here to keep the author's own formatting.
  return text?.trim() ? (
    <div className={valueStyle}>{text}</div>
  ) : (
    <div className={emptyValueStyle}>{emptyText}</div>
  );
};
