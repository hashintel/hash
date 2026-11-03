import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { StepTone } from "./step-display";
import type { IconName } from "@hashintel/ds-components";

const tile = css({
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
});
const largeTile = css({ width: "6", height: "6", borderRadius: "sm" });
const smallTile = css({
  width: "[14px]",
  height: "[14px]",
  borderRadius: "[3px]",
  bg: "bg.shaded.hover",
});

/**
 * Large on canvas cards, tinted by the step's tone; small in the Steps tab, on a neutral tile. Figma's icons are 14px
 * and 10px, which `Icon` has no sizes for (logged as a gap), so the nearest smaller ones are used.
 */
export const StepIconTile = ({
  icon,
  tone,
  size,
}: {
  icon: IconName;
  tone: StepTone;
  size: "small" | "large";
}) => (
  <span
    className={cx(tile, size === "large" ? largeTile : smallTile)}
    style={{
      background:
        size === "large" ? `var(--colors-${tone}-bg-subtle)` : undefined,
      color: `var(--colors-${tone}-fg-muted)`,
    }}
  >
    <Icon name={icon} size={size === "large" ? "xs" : "xxs"} />
  </span>
);
