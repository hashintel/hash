import { types } from "@hashintel/hash-shared/types";
import { ValueCellEditorComponent } from "./types";
import { ArrayEditor } from "./value-cell-editor/array-editor";
import { BooleanEditor } from "./value-cell-editor/boolean-editor";
import { NumberOrStringEditor } from "./value-cell-editor/number-or-string-editor";

export const ValueCellEditor: ValueCellEditorComponent = (props) => {
  const { value } = props;

  /** @todo remove dataTypes[0] when multiple data types are supported */
  const dataType = value.data.property.dataTypes[0];

  const isBoolean = dataType === types.dataType.boolean.title;
  const isArray = dataType === "Array";

  if (isArray) {
    return <ArrayEditor {...props} />;
  }

  if (isBoolean) {
    return <BooleanEditor {...props} />;
  }

  return <NumberOrStringEditor {...props} />;
};
