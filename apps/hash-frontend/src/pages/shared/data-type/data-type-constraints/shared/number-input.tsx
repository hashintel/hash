import { Box } from "@mui/material";

export const NumberInput = ({
  id,
  disabled,
  min,
  max,
  multipleOf,
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
      sx={({ palette }) => ({
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: 1,
        fontSize: 14,
        py: 1.2,
        px: 1.5,
        mt: 0.5,
        width,
      })}
    />
  );
};
