import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { StepTone } from "./step-display";
import type { IconName } from "@hashintel/ds-components";

/**
 * The tile and icon steps the designs give each hue so that none looks weaker than another: yellow's tile is a step
 * deeper, and purple's and pink's icons lighter, than the rest.
 */
const tones: Record<StepTone, string> = {
  yellow: css({ bg: "yellow.s35", color: "yellow.s110" }),
  blue: css({ bg: "blue.s25", color: "blue.s110" }),
  pink: css({ bg: "pink.s25", color: "pink.s100" }),
  orange: css({ bg: "orange.s25", color: "orange.s110" }),
  green: css({ bg: "green.s25", color: "green.s110" }),
  purple: css({ bg: "purple.s25", color: "purple.s90" }),
  neutral: css({ bg: "neutral.s25", color: "neutral.s105" }),
};

const tile = css({
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
});
const tileSizes = {
  small: css({ width: "[14px]", height: "[14px]", borderRadius: "[3px]" }),
  large: css({ width: "6", height: "6", borderRadius: "sm" }),
  header: css({ width: "10", height: "10", borderRadius: "lg" }),
};
const iconSizes = { small: "xxs", large: "xs", header: "sm" } as const;

/**
 * A rounded square in the step's hue: small in the Steps and Add tabs, large on canvas cards, and the panel header's
 * 40px tile. Figma's icons are 10px, 14px and 20px, which `Icon` has no sizes for, so the nearest smaller ones are used.
 */
export const StepIconTile = ({
  icon,
  tone,
  size,
}: {
  icon: IconName;
  tone: StepTone;
  size: keyof typeof tileSizes;
}) => (
  <span className={cx(tile, tileSizes[size], tones[tone])}>
    <Icon name={icon} size={iconSizes[size]} />
  </span>
);
