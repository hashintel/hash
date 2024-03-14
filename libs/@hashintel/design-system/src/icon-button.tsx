import type { IconButtonProps as MuiIconButtonProps } from "@mui/material";
import { IconButton as MuiIconButton } from "@mui/material";
import type { FunctionComponent } from "react";
import { forwardRef } from "react";

export type IconButtonProps = {
  unpadded?: boolean;
  rounded?: boolean;
} & MuiIconButtonProps;

export const IconButton: FunctionComponent<IconButtonProps> = forwardRef(
  ({ children, unpadded, rounded, sx = [], ...props }, ref) => {
    return (
      <MuiIconButton
        ref={ref}
        {...props}
        sx={[
          {
            padding: unpadded ? "4px" : "8px",
            borderRadius: "4px",
            ...(rounded && {
              borderRadius: "50%",
              "&:focus-visible:after": {
                borderRadius: "50%",
              },
            }),
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </MuiIconButton>
    );
  },
);
