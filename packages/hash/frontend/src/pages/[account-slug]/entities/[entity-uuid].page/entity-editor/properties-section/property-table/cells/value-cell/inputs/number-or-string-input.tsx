import { TextField } from "@hashintel/hash-design-system";
import { CellInputProps } from "./types";

export const NumberOrStringInput = ({
  onChange,
  value,
  isNumber,
}: CellInputProps<number | string> & { isNumber: boolean }) => {
  return (
    <TextField
      sx={{ my: "1px" }}
      autoFocus
      value={value}
      type={isNumber ? "number" : "text"}
      inputMode={isNumber ? "numeric" : "text"}
      placeholder="Start typing..."
      onChange={({ target }) => {
        const isEmptyString = target.value === "";

        const newValue =
          isNumber && !isEmptyString ? Number(target.value) : target.value;

        onChange(newValue);
      }}
    />
  );
};
