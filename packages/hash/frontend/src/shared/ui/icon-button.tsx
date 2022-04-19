import {
  /* eslint-disable-next-line -- allow import of original popover to extend it */
  IconButton as MuiIconButton,
  IconButtonProps as MuiIconButtonProps,
} from "@mui/material";
import { forwardRef, FC } from "react";

export type IconButtonProps = {
  unpadded?: boolean;
  rounded?: boolean;
} & MuiIconButtonProps;

export const IconButton: FC<IconButtonProps> = forwardRef(
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
