import { faCheck, faClose } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  MenuItem,
  TextField,
} from "@hashintel/hash-design-system";
import { capitalize, cloneDeep } from "lodash";
import { ValueCellEditorProps } from "../types";

export const BooleanEditor: ValueCellEditorProps = ({
  value: cell,
  onFinishedEditing,
}) => {
  const { value } = cell.data.property;

  return (
    <TextField
      sx={{ my: "1px" }}
      select
      SelectProps={{ defaultOpen: true }}
      value={Number(value)}
      onChange={({ target }) => {
        const newCell = cloneDeep(cell);
        newCell.data.property.value = !!target.value;

        onFinishedEditing(newCell);
      }}
    >
      {[0, 1].map((val) => (
        <MenuItem
          key={val}
          sx={{ display: !!val === value ? "none" : "flex" }}
          className="click-outside-ignore"
          value={val}
        >
          <FontAwesomeIcon
            icon={val ? faCheck : faClose}
            sx={{ mr: 1, color: ({ palette }) => palette.gray[50] }}
          />
          {capitalize(String(!!val))}
        </MenuItem>
      ))}
    </TextField>
  );
};
