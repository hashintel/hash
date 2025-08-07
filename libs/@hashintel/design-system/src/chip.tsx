import { faCircle } from "@fortawesome/free-solid-svg-icons";
import type { ChipProps as MuiChipProps } from "@mui/material";
import { Chip as MuiChip, chipClasses } from "@mui/material";
import { forwardRef } from "react";

import { FontAwesomeIcon } from "./fontawesome-icon";

export type ChipProps = {
  hasCircleStartIcon?: boolean;
  rectangular?: boolean;
  href?: string;
} & MuiChipProps;

// @todo
// Handle displaying icons on the right. MUI Chip only
// allows the delete icon can be displayed on the right when onDelete prop
// is passed in
// @see https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Chip/Chip.js#L444-L448

export const Chip = forwardRef<HTMLDivElement, ChipProps>(
  (
    {
      sx = [],
      icon: startIcon,
      color = "gray",
      hasCircleStartIcon,
      rectangular,
      ...props
    },
    ref,
  ) => {
    return (
      <MuiChip
        ref={ref}
        color={color}
        sx={[
          ({ palette }) => ({
            ...(rectangular && {
              borderRadius: 0.5,
            }),
            // circle start icon has a lighter shade compared to the shade
            // applied by default to the icon class
            ...(hasCircleStartIcon && {
              [`& .${chipClasses.icon}`]: {
                color: palette[color][50],
              },
            }),
            py: 0.1,
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        icon={
          hasCircleStartIcon ? <FontAwesomeIcon icon={faCircle} /> : startIcon
        }
        {...props}
      />
    );
  },
);
