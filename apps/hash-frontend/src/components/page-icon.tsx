import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, BoxProps } from "@mui/material";

import { CanvasIcon } from "../shared/icons/canvas-icon";

export type SizeVariant = "small" | "medium";

export const pageIconVariantSizes: Record<
  SizeVariant,
  { container: number; font: number }
> = {
  small: { container: 20, font: 14 },
  medium: { container: 44, font: 36 },
};

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
  const sizes = pageIconVariantSizes[size];

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
