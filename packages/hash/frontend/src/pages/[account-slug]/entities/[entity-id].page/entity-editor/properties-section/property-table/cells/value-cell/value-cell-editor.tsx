import { types } from "@hashintel/hash-shared/types";
import { ValueCellEditorComponent } from "./types";
import { ArrayEditor } from "./value-cell-editor/array-editor";
import { BooleanEditor } from "./value-cell-editor/boolean-editor";
import { NumberOrStringEditor } from "./value-cell-editor/number-or-string-editor";

export const ValueCellEditor: ValueCellEditorComponent = (props) => {
  const { value } = props;
  const { expectedTypes: dataTypes, isArray } = value.data.property;

  /** @todo remove dataTypes[0] when multiple data types are supported */
  const isBoolean = dataTypes[0] === types.dataType.boolean.title;

  if (isArray) {
    return <ArrayEditor {...props} />;
  }

  if (isBoolean) {
    return <BooleanEditor {...props} />;
  }

  return <NumberOrStringEditor {...props} />;
};
