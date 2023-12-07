import {
  Checkbox,
  FormControlLabel,
  formControlLabelClasses,
  FormControlLabelProps,
} from "@mui/material";
import { FunctionComponent } from "react";

export const CheckboxFilter: FunctionComponent<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  sx?: FormControlLabelProps["sx"];
}> = ({ label, checked, onChange, sx }) => (
  <FormControlLabel
    sx={[
      {
        borderRadius: 16,
        color: ({ palette }) => palette.gray[70],
        marginX: 0,
        flexShrink: 0,
        gap: 1,
        mt: 0.1,
        px: 1,
        py: 0.6,
        [`.${formControlLabelClasses.label}`]: {
          fontSize: 13,
          fontWeight: 500,
        },
        transition: ({ transitions }) =>
          transitions.create(["background", "color"]),
        "&:hover": {
          background: ({ palette }) => palette.gray[10],
          color: ({ palette }) => palette.gray[90],
        },
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    label={label}
    control={
      <Checkbox
        sx={{
          svg: {
            width: 12,
            height: 12,
          },
        }}
        checked={checked}
        onChange={({ target }) => onChange(target.checked)}
      />
    }
  />
);
