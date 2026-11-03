import { Box } from "@mui/material";

import { Icon } from "@hashintel/ds-components";

import type { StepTone } from "./step-display";
import type { IconName } from "@hashintel/ds-components";

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
  <Box
    component="span"
    sx={{
      display: "flex",
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      width: size === "large" ? 24 : 14,
      height: size === "large" ? 24 : 14,
      borderRadius: size === "large" ? "4px" : "3px",
      background:
        size === "large"
          ? `var(--colors-${tone}-bg-subtle)`
          : "var(--colors-neutral-bg-shaded-hover)",
      color: `var(--colors-${tone}-fg-muted)`,
    }}
  >
    <Icon name={icon} size={size === "large" ? "xs" : "xxs"} />
  </Box>
);
