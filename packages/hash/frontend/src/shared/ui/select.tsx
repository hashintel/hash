import {
  Select as MuiSelect,
  SelectProps as MuiSelectProps,
} from "@mui/material";
import { FC, forwardRef, ReactNode } from "react";

export type SelectProps = {
  children: ReactNode;
} & MuiSelectProps;

export const Select: FC<SelectProps> = forwardRef(
  ({ children, sx = [], ...props }, ref) => {
    return (
      <MuiSelect
        // sx={[({ palette }) => ({

        // }), ...(Array.isArray(sx) ? sx : [sx])]}
        {...props}
        ref={ref}
      >
        {children}
      </MuiSelect>
    );
  },
);
