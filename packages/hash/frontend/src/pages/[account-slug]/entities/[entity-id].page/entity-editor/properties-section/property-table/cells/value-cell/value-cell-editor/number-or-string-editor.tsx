import { TextField } from "@hashintel/hash-design-system";
import { cloneDeep } from "lodash";
import { types } from "@hashintel/hash-shared/types";
import { ValueCellEditorComponent } from "../types";

export const NumberOrStringEditor: ValueCellEditorComponent = ({
  value: cell,
  onChange,
}) => {
  const { value, dataTypes } = cell.data.property;
  /** @todo remove dataTypes[0] when multiple data types are supported */
  const isNumber = types.dataType.number.title === dataTypes[0];

  return (
    <TextField
      sx={{ my: "1px" }}
      autoFocus
      value={value}
      type={isNumber ? "number" : "text"}
      inputMode={isNumber ? "numeric" : "text"}
      onChange={({ target }) => {
        const newCell = cloneDeep(cell);
        const clearedInput = target.value === "";

        const newValue =
          isNumber && !clearedInput ? Number(target.value) : target.value;

        newCell.data.property.value = newValue;
        onChange(newCell);
      }}
    />
  );
};
