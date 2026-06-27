import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "./cost";
import { trendToneFor } from "./trend-tone";

import type { ReactNode } from "react";

const wrap = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  fontVariantNumeric: "tabular-nums",
});
// Rising lead time / cost is unfavourable, so up = red, down = green; an
// identical period (rounds to 0%) is shown as a neutral grey equals glyph.
const toneUp = css({ color: "status.error.fg.body" });
const toneDown = css({ color: "status.success.fg.body" });
const toneFlat = css({ color: "fg.subtle" });

/**
 * Shared trend glyph used in the full tables and the brief headline cards.
 * Renders a coloured trend arrow (or a grey equals icon when the period is
 * identical) followed by either the signed percentage (default) or custom
 * children (e.g. the brief's "<previous> last period").
 */

/** Two-bar equals glyph (no equivalent in the icon set) for an unchanged period. */
const EqualsIcon = () => {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5h7M2.5 7.5h7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
};
export const TrendIndicator = ({
  pctChange,
  children,
  nullLabel = "\u2013",
  iconSize = "xs",
  className,
}: {
  pctChange: number | null | undefined;
  children?: ReactNode;
  nullLabel?: string;
  iconSize?: "xs" | "sm";
  className?: string;
}) => {
  const tone = trendToneFor(pctChange);
  if (tone == null) {
    return <span className={cx(wrap, toneFlat, className)}>{nullLabel}</span>;
  }
  const toneClass =
    tone === "up" ? toneUp : tone === "down" ? toneDown : toneFlat;
  return (
    <span className={cx(wrap, toneClass, className)}>
      {tone === "flat" ? (
        <EqualsIcon />
      ) : (
        <Icon
          name={tone === "up" ? "arrowTrendUp" : "arrowTrendDown"}
          size={iconSize}
        />
      )}
      {children ?? (
        <span>{`${(pctChange ?? 0) > 0 ? "+" : ""}${formatNumber(pctChange ?? 0, { maximumFractionDigits: 0 })}%`}</span>
      )}
    </span>
  );
};
