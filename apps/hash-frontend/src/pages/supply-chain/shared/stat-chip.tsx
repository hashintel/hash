import { css, cx } from "@hashintel/ds-helpers/css";

// `flexWrap` lets the label drop onto its own line *under* the value when the
// chip is squeezed (value and label each stay unbroken), and sit inline beside
// it when there's room. `minW:0` lets the chip shrink to trigger that wrap.
const chip = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "1",
  rowGap: "0",
  minW: "0",
  pr: "4",
  mr: "4",
  borderRightWidth: "1px",
  borderColor: "bd.subtle",
  _last: { borderRightWidth: "0", pr: "0", mr: "0" },
});
const chipButton = css({
  appearance: "none",
  bg: "[transparent]",
  borderTopWidth: "0",
  borderBottomWidth: "0",
  borderLeftWidth: "0",
  pt: "0",
  pb: "0",
  pl: "0",
  mt: "0",
  mb: "0",
  ml: "0",
  color: "[inherit]",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
  _hover: { textDecoration: "underline" },
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "[currentColor]",
    outlineOffset: "[2px]",
  },
});
const valueBase = css({
  fontWeight: "medium",
  textStyle: "sm",
  fontVariantNumeric: "tabular-nums",
  flexShrink: "0",
});
const valueHighlight = css({ color: "status.error.fg.body" });
const valuePlain = css({ color: "fg.max" });
const labelText = css({
  textStyle: "sm",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});

/** Inline labelled metric, separated from siblings by a right border. */
export const StatChip = ({
  value,
  label,
  isHighlight,
  onClick,
}: {
  value: string;
  label: string;
  isHighlight?: boolean;
  onClick?: () => void;
}) => {
  const content = (
    <>
      <span
        className={cx(valueBase, isHighlight ? valueHighlight : valuePlain)}
      >
        {value}
      </span>
      <span className={labelText}>{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cx(chip, chipButton)} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={chip}>{content}</div>;
};
