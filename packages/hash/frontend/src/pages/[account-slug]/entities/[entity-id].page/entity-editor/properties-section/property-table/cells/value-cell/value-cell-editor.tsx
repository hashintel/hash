import { types } from "@hashintel/hash-shared/types";
import { ValueCellEditorComponent } from "./types";
import { BooleanEditor } from "./value-cell-editor/boolean-editor";
import { NumberOrStringEditor } from "./value-cell-editor/number-or-string-editor";

export const ValueCellEditor: ValueCellEditorComponent = (props) => {
  const { value: cell } = props;
  /** @todo remove dataTypes[0] when multiple data types are supported */
  const isBoolean =
    cell.data.property.dataTypes[0] === types.dataType.boolean.title;

  if (isBoolean) {
    return <BooleanEditor {...props} />;
  }

  return <NumberOrStringEditor {...props} />;
};
