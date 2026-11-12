/**
 * figma-ds tabs (`_TabItemUnderlined` `18894:11394`), variant simple, size sm (28 px): 6 px inset, 10 px corners,
 * 14 px medium words, subtle grey at rest, dark when selected, the #f9f9f9 fill on hover. A count is the part's Badge
 * (`_showBadge`): 16 px high, 4 px corners, s30 fill, 12 px medium.
 *
 * Gap, recorded: the part's layers put the badge before the words; here it follows them ("All 17"), as the counts
 * have read since 4 Nov (ledger L320).
 *
 * Takes for inbox audit-logs-tabs, `?logtabs=`: no param (or `keep`) is the look above; `revert` is the look before
 * 72af9f5d5 (muted count after the label, the selected tab on a fill); `figma`, `underlined` and `simple` are the
 * figma-ds variants with the badge before the label, blue on the selected tab; `quiet` is simple with every badge grey.
 */
import { css, cx } from "@hashintel/ds-helpers/css";

type Look = "keep" | "revert" | "figma" | "underlined" | "simple" | "quiet";

const looks: Look[] = ["revert", "figma", "underlined", "simple", "quiet"];

const lookParam = new URLSearchParams(globalThis.location.search).get(
  "logtabs",
);

const look: Look = looks.includes(lookParam as Look)
  ? (lookParam as Look)
  : "keep";

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

/** Before 72af9f5d5: 8 px corners, a muted count after the label, the selected tab on a subtle neutral fill. */
const revertTabStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  paddingX: "2.5",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  cursor: "pointer",
  borderRadius: "lg",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[aria-selected=true]": {
    color: "neutral.fg.heading",
    backgroundColor: "neutral.bg.surface.active",
  },
});

const revertCountStyle = css({
  color: "neutral.fg.subtle",
  fontVariantNumeric: "tabular-nums",
});

/** figma-ds Tabs row: rounded and simple 3 px apart; underlined 20 px apart over a 1 px line. */
const figmaListStyle = css({
  display: "flex",
  alignItems: "stretch",
  height: "[28px]",
  gap: "[3px]",
});

const underlinedListStyle = css({
  display: "flex",
  alignItems: "stretch",
  height: "[28px]",
  gap: "[20px]",
  boxShadow: "[inset 0 -1px 0 rgba(0,0,0,.15)]",
});

const figmaItemBase = {
  all: "unset",
  display: "inline-flex",
  alignItems: "center",
  gap: "[8px]",
  height: "[28px]",
  fontSize: "[14px]",
  lineHeight: "[14px]",
  fontWeight: "normal",
  cursor: "pointer",
  whiteSpace: "nowrap",
  _focusVisible: { boxShadow: "[0 0 0 2px var(--colors-neutral-a20)]" },
} as const;

const roundedTabStyle = css({
  ...figmaItemBase,
  paddingX: "[6px]",
  borderRadius: "[10px]",
  backgroundColor: "[#fdfdfd]",
  color: "[#838383]",
  boxShadow: "[inset 0 0 0 1px transparent]",
  _hover: {
    backgroundColor: "[#f9f9f9]",
    boxShadow: "[inset 0 0 0 1px rgba(0,0,0,.13)]",
  },
  "&[aria-selected=true]": {
    color: "[#202020]",
    boxShadow: "[inset 0 0 0 1px rgba(0,0,0,.13)]",
  },
});

const underlinedTabStyle = css({
  ...figmaItemBase,
  paddingX: "[3px]",
  color: "[#404040]",
  _hover: { boxShadow: "[inset 0 -1px 0 rgba(0,0,0,.2)]" },
  "&[aria-selected=true]": {
    color: "[#202020]",
    boxShadow: "[inset 0 -2px 0 rgba(0,0,0,.125)]",
  },
});

const simpleTabStyle = css({
  ...figmaItemBase,
  paddingX: "[6px]",
  borderRadius: "[10px]",
  color: "[#838383]",
  _hover: { backgroundColor: "[#f9f9f9]" },
  "&[aria-selected=true]": { color: "[#202020]" },
});

/** figma-ds Badge 432:29672, sm, isSquare: gray #f0f0f0 / #202020, brand #e6f4fe / #0d74ce. */
const figmaBadgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "[16px]",
  height: "[16px]",
  paddingX: "[4px]",
  borderRadius: "[4px]",
  backgroundColor: "[#f0f0f0]",
  color: "[#202020]",
  fontSize: "[12px]",
  lineHeight: "[12px]",
  fontWeight: "medium",
});

const brandBadgeStyle = css({
  backgroundColor: "[#e6f4fe]",
  color: "[#0d74ce]",
});

const figmaTabStyle: Partial<Record<Look, string>> = {
  figma: roundedTabStyle,
  underlined: underlinedTabStyle,
  simple: simpleTabStyle,
  quiet: simpleTabStyle,
};

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
}) => {
  if (look === "revert") {
    return (
      <div role="tablist" aria-label={label} className={listStyle}>
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={value === item.value}
            className={revertTabStyle}
            onClick={() => onChange(item.value)}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span className={revertCountStyle}>{item.count}</span>
            )}
          </button>
        ))}
      </div>
    );
  }
  const figmaTab = figmaTabStyle[look];
  if (figmaTab) {
    return (
      <div
        role="tablist"
        aria-label={label}
        className={look === "underlined" ? underlinedListStyle : figmaListStyle}
      >
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={value === item.value}
            className={figmaTab}
            onClick={() => onChange(item.value)}
          >
            {item.count === undefined ? null : (
              <span
                className={cx(
                  figmaBadgeStyle,
                  look !== "quiet" && value === item.value && brandBadgeStyle,
                )}
              >
                {item.count}
              </span>
            )}
            {item.label}
          </button>
        ))}
      </div>
    );
  }
  return (
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
};
