import { Box } from "@mui/material";

export const NumberInput = ({
  id,
  min,
  max,
  multipleOf,
  value,
  onChange,
  width = 120,
}: {
  id?: string;
  min?: number;
  max?: number;
  multipleOf?: number;
  onChange: (value: number) => void;
  value?: number;
  width?: number;
}) => {
  return (
    <Box
      component="input"
      id={id}
      step={multipleOf}
      min={min}
      max={max}
      type="number"
      value={value?.toString()}
      onChange={(event) => onChange(parseInt(event.target.value, 10))}
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
