import { Box } from "@mui/material";

import { Icon } from "@hashintel/ds-components";

import type { StepTone } from "./step-display";
import type { IconName } from "@hashintel/ds-components";

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
      width: size === "large" ? 24 : 16,
      height: size === "large" ? 24 : 16,
      borderRadius: size === "large" ? "4px" : "3px",
      background: `var(--colors-${tone}-bg-subtle)`,
      color: `var(--colors-${tone}-fg-muted)`,
    }}
  >
    <Icon name={icon} size={size === "large" ? "xs" : "xxs"} />
  </Box>
);
