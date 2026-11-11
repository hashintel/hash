/**
 * figma-ds tabs (`_TabItemUnderlined` `18894:11394`), variant simple, size sm (28 px): 6 px inset, 10 px corners,
 * 14 px medium words, subtle grey at rest, dark when selected, the #f9f9f9 fill on hover. A count is the part's Badge
 * (`_showBadge`): 16 px high, 4 px corners, s30 fill, 12 px medium.
 *
 * Gap, recorded: the part's layers put the badge before the words; here it follows them ("All 17"), as the counts
 * have read since 4 Nov (ledger L320).
 */
import { css } from "@hashintel/ds-helpers/css";

const listStyle = css({ display: "flex", alignItems: "center", gap: "1" });

const tabStyle = css({
  all: "unset",
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  height: "[28px]",
  paddingX: "[6px]",
  borderRadius: "[10px]",
  textStyle: "sm",
  lineHeight: "[14px]",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  whiteSpace: "nowrap",
  _hover: {
    backgroundColor: "neutral.bg.subtle.hover",
    color: "neutral.fg.heading",
  },
  _focusVisible: { boxShadow: "[0 0 0 2px var(--colors-neutral-a20)]" },
  "&[aria-selected=true]": { color: "neutral.fg.heading" },
});

const badgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "[16px]",
  height: "[16px]",
  paddingX: "1",
  borderRadius: "[4px]",
  backgroundColor: "neutral.s30",
  textStyle: "xs",
  lineHeight: "[12px]",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  fontVariantNumeric: "tabular-nums",
});

export const Tabs = <Value extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: Value; label: string; count?: React.ReactNode }[];
  value: Value;
  onChange: (value: Value) => void;
}) => (
  <div role="tablist" aria-label={label} className={listStyle}>
    {items.map((item) => (
      <button
        key={item.value}
        type="button"
        role="tab"
        aria-selected={value === item.value}
        className={tabStyle}
        onClick={() => onChange(item.value)}
      >
        {item.label}
        {item.count === undefined ? null : (
          <span className={badgeStyle}>{item.count}</span>
        )}
      </button>
    ))}
  </div>
);
