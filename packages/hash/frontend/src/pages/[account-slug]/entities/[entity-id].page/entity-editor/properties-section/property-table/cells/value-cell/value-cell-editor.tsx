import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { TextField } from "@hashintel/hash-design-system";
import { cloneDeep } from "lodash";
import { ValueCell } from "./types";

/**
 * @todo this should be used only for strings
 * make sure to handle editors for other types as well
 * */
export const ValueCellEditor: ProvideEditorComponent<ValueCell> = ({
  value,
  onChange,
}) => {
  return (
    <TextField
      sx={{ my: "1px" }}
      autoFocus
      value={value.data.property.value}
      onChange={(event) => {
        const newValue = cloneDeep(value);
        newValue.data.property.value = event.target.value;
        onChange(newValue);
      }}
    />
  );
};
