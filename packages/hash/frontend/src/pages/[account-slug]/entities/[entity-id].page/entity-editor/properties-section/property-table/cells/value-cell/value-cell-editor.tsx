import { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { TextField } from "@hashintel/hash-design-system";
import { ValueCell } from "../value-cell";

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
        const newValue = { ...value };
        newValue.data.property.value = event.target.value;
        onChange(newValue);
      }}
    />
  );
};
