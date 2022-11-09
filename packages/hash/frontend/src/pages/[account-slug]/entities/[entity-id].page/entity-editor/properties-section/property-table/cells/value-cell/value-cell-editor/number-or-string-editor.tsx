import { TextField } from "@hashintel/hash-design-system";
import { cloneDeep } from "lodash";
import { ValueCellEditorProps } from "../types";

export const NumberOrStringEditor: ValueCellEditorProps = ({
  value: cell,
  onChange,
}) => {
  const { value } = cell.data.property;
  const isNumber = typeof value === "number";

  return (
    <TextField
      sx={{ my: "1px" }}
      autoFocus
      value={value}
      type={isNumber ? "number" : "text"}
      inputMode={isNumber ? "numeric" : "text"}
      onChange={({ target }) => {
        const newCell = cloneDeep(cell);
        const newValue = isNumber ? Number(target.value) : target.value;
        newCell.data.property.value = newValue;

        onChange(newCell);
      }}
    />
  );
};
