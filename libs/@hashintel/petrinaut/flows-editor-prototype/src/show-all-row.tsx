/**
 * The overflow row (11 Nov, inbox conv-overflow): a list shows its first rows, then "Show all N". In a panel it opens
 * the 640 px sheet; below a table it shows the rest of the table. One row style for both. A run of chips keeps "+N".
 */
import { css } from "@hashintel/ds-helpers/css";

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[40px]",
  textStyle: "sm",
  color: "neutral.fg.muted",
  fontVariantNumeric: "tabular-nums",
});

const linkStyle = css({
  all: "unset",
  cursor: "pointer",
  color: "neutral.fg.body",
  textUnderlineOffset: "[2px]",
  _hover: { textDecorationLine: "underline" },
  _focusVisible: { textDecorationLine: "underline", outline: "none" },
});

export const ShowAllRow = ({
  total,
  noun,
  onClick,
  className,
}: {
  /** A number, or one already formatted ("1,284"). */
  total: number | string;
  /** What the list holds, plural ("runs", "certificates"); left out, the row reads "Show all N". */
  noun?: string;
  onClick: () => void;
  className?: string;
}) => (
  <div
    className={className ? `${rowStyle} ${className}` : rowStyle}
    data-show-all
  >
    <button type="button" className={linkStyle} onClick={onClick}>
      {noun ? `Show all ${total} ${noun}` : `Show all ${total}`}
    </button>
  </div>
);
