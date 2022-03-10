import {
  // eslint-disable-next-line no-restricted-imports
  IconButton as MuiIconButton,
  IconButtonProps as MuiIconButtonProps,
} from "@mui/material";
import { forwardRef, FC } from "react";

export type IconButtonProps = {
  unpadded?: boolean;
  rounded?: boolean;
} & MuiIconButtonProps;

export const IconButton: FC<IconButtonProps> = forwardRef(
  ({ children, unpadded, rounded, sx, ...props }, ref) => {
    return (
      <MuiIconButton
        ref={ref}
        {...props}
        sx={{
          padding: unpadded ? "4px" : "8px",
          borderRadius: rounded ? "50%" : "4px",
          ...sx,
        }}
      >
        {children}
      </MuiIconButton>
    );
  },
);
