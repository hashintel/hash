import { Box } from "@mui/material";

export const IntegerInput = ({
  min = 1,
  max,
  value,
  setValue,
  width,
}: {
  min?: number;
  max?: number;
  value: number;
  setValue: (value: number) => void;
  width?: number;
}) => {
  return (
    <Box
      component="input"
      step={1}
      min={min}
      max={max}
      type="number"
      value={value.toString()}
      onChange={(event) => setValue(parseInt(event.target.value, 10))}
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
