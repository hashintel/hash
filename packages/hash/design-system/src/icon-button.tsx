import {
  /* eslint-disable-next-line -- allow import of original icon button to extend it */
  IconButton as MuiIconButton,
  IconButtonProps as MuiIconButtonProps,
} from "@mui/material";
import * as React from "react";

export type IconButtonProps = {
  unpadded?: boolean;
  rounded?: boolean;
} & MuiIconButtonProps;

export const IconButton: React.FC<IconButtonProps> = React.forwardRef(
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
