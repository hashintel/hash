import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { BoxProps } from "@mui/material";
import { Box } from "@mui/material";

import type { SizeVariant } from "../shared/edit-emoji-icon-button";
import { iconVariantSizes } from "../shared/edit-emoji-icon-button";
import { CanvasIcon } from "../shared/icons/canvas-icon";

interface PageIconProps {
  isCanvas?: boolean;
  icon?: string | null;
  size?: SizeVariant;
  sx?: BoxProps["sx"];
}

export const PageIcon = ({
  isCanvas,
  icon,
  size = "medium",
  sx = [],
}: PageIconProps) => {
  const sizes = iconVariantSizes[size];

  return (
    <Box
      sx={[
        {
          width: sizes.container,
          height: sizes.container,
          fontSize: sizes.font,
          fontFamily: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {icon ??
        (isCanvas ? (
          <CanvasIcon
            sx={{
              fill: ({ palette }) => palette.gray[40],
              fontSize: sizes.font + 2,
            }}
          />
        ) : (
          <FontAwesomeIcon
            icon={faFile}
            sx={(theme) => ({
              fontSize: `${sizes.font}px !important`,
              color: theme.palette.gray[40],
            })}
          />
        ))}
    </Box>
  );
};
