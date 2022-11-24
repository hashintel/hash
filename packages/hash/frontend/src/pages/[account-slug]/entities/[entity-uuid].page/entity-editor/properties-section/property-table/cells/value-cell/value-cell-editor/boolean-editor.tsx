import { faCheck, faClose } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  MenuItem,
  TextField,
} from "@hashintel/hash-design-system";
import produce from "immer";
import { ValueCellEditorComponent } from "../types";

export const BooleanEditor: ValueCellEditorComponent = ({
  value: cell,
  onFinishedEditing,
}) => {
  const { value } = cell.data.property;
  const numberValue = value ? 1 : 0;

  return (
    <TextField
      sx={{ my: "1px" }}
      select
      SelectProps={{ defaultOpen: true }}
      value={numberValue}
      onChange={({ target }) => {
        const newCell = produce(cell, (draftCell) => {
          draftCell.data.property.value = !!target.value;
        });

        onFinishedEditing(newCell);
      }}
    >
      {[0, 1].map((option) => (
        <MenuItem
          key={option}
          sx={{ display: option === numberValue ? "none" : "flex" }}
          className="click-outside-ignore"
          value={option}
        >
          <FontAwesomeIcon
            icon={option ? faCheck : faClose}
            sx={{ mr: 1, color: "gray.50" }}
          />
          {option ? "True" : "False"}
        </MenuItem>
      ))}
    </TextField>
  );
};
