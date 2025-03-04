import { Box, type SxProps, type Theme } from "@mui/material";

import { inputStyles } from "../../shared/input-styles";

export const NumberInput = ({
  id,
  disabled,
  min,
  max,
  multipleOf,
  sx,
  value,
  onChange,
  width = 120,
}: {
  id?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  multipleOf?: number;
  onChange: (value: number | null) => void;
  sx?: SxProps<Theme>;
  value: number | null;
  width?: number;
}) => {
  return (
    <Box
      component="input"
      id={id}
      disabled={disabled}
      step={multipleOf}
      min={min}
      max={max}
      type="number"
      value={value != null ? value.toString() : ""}
      onChange={(event) => {
        const parsedValue = parseInt(event.target.value, 10);

        if (Number.isNaN(parsedValue)) {
          onChange(null);
        } else {
          onChange(parsedValue);
        }
      }}
      sx={[inputStyles, { width }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
};
