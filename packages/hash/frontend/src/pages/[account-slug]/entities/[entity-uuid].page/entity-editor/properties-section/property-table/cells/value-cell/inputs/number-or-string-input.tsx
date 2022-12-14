import { TextField } from "@hashintel/hash-design-system";
import { CellInputProps } from "./types";

export const NumberOrStringInput = ({
  onChange,
  value,
  isNumber,
  onEnterPressed,
}: CellInputProps<number | string> & {
  isNumber: boolean;
  onEnterPressed?: () => void;
}) => {
  /** @todo BUG: edit-re-editing number values make them text values again */
  return (
    <TextField
      sx={{ width: "100%" }}
      variant="standard"
      InputProps={{ disableUnderline: true }}
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
      onKeyDown={(event) => {
        if (onEnterPressed && event.key === "Enter") {
          event.stopPropagation();
          onEnterPressed();
        }
      }}
    />
  );
};
