import { ValueCellEditorProps } from "./types";
import { BooleanEditor } from "./value-cell-editor/boolean-editor";
import { NumberOrStringEditor } from "./value-cell-editor/number-or-string-editor";

export const ValueCellEditor: ValueCellEditorProps = (props) => {
  const { value: cell } = props;
  const isBoolean = typeof cell.data.property.value === "boolean";

  if (isBoolean) {
    return <BooleanEditor {...props} />;
  }

  return <NumberOrStringEditor {...props} />;
};
