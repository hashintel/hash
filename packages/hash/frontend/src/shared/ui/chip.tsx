import { FC, forwardRef } from "react";
import {
  /* eslint-disable-next-line -- allow import of original chip to extend it */
  Chip as MuiChip,
  chipClasses,
  ChipProps as MuiChipProps,
} from "@mui/material";
import { faCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "../icons";

export type ChipProps = {
  hasCircleStartIcon?: boolean;
  rectangular?: boolean;
} & MuiChipProps;

export const Chip: FC<ChipProps> = forwardRef(
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
