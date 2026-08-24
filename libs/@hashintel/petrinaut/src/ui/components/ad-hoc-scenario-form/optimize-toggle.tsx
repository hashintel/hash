/**
 * The labeled Optimize toggle from the prototype: a compact pill carrying the
 * word "Optimize" and a sliding knob, purple while on.
 */

import { css, cx } from "@hashintel/ds-helpers/css";

const pillStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[20px]",
  paddingX: "2",
  borderRadius: "full",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s10",
  fontSize: "[10px]",
  fontWeight: "medium",
  color: "neutral.s90",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition:
    "[background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease]",
  _hover: { backgroundColor: "neutral.s20" },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[1px]",
  },
});

const pillOnStyle = css({
  backgroundColor: "purple.s100",
  borderColor: "purple.s100",
  color: "neutral.s00",
  _hover: { backgroundColor: "purple.s110" },
});

const knobStyle = css({
  display: "inline-block",
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  backgroundColor: "neutral.s60",
  transition: "[background-color 0.15s ease]",
});

const knobOnStyle = css({
  backgroundColor: "neutral.s00",
});

export interface OptimizeToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  /** Accessible name; the visible text stays "Optimize". */
  label: string;
  className?: string;
  /** Registers the pill for an owning grid's keyboard navigation. */
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
}

export const OptimizeToggle: React.FC<OptimizeToggleProps> = ({
  value,
  onChange,
  label,
  className,
  buttonRef,
  onKeyDown,
}) => (
  <button
    ref={buttonRef}
    type="button"
    aria-pressed={value}
    aria-label={label}
    className={cx(pillStyle, value && pillOnStyle, className)}
    onClick={() => onChange(!value)}
    onKeyDown={onKeyDown}
  >
    <span className={cx(knobStyle, value && knobOnStyle)} />
    Optimize
  </button>
);
