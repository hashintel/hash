import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/hash-design-system";
import { Box, Tooltip } from "@mui/material";
import produce from "immer";
import { useState } from "react";
import { ValueCellEditorComponent } from "../types";
import { faText } from "../../../../../../../../../../shared/icons/pro/fa-text";

const ValueChip = ({
  value,
  onDelete,
}: {
  value: string;
  onDelete: () => void;
}) => {
  return (
    <Chip
      icon={
        <Tooltip title="Text" placement="top">
          <FontAwesomeIcon
            icon={{ icon: faText }}
            sx={{
              /**
               * used zIndex:1, otherwise label of the chip is rendered over icon with transparent background,
               * which prevents tooltip from opening
               */
              zIndex: 1,
            }}
          />
        </Tooltip>
      }
      label={value}
      onDelete={onDelete}
    />
  );
};

export const ArrayEditor: ValueCellEditorComponent = ({
  value: cell,
  onChange,
}) => {
  const { value } = cell.data.property;

  const valuesArray = Array.isArray(value) ? value : [value];

  const [isAdding, setIsAdding] = useState(!valuesArray.length);
  const [input, setInput] = useState("");

  const addItem = (text: string) => {
    const newCell = produce(cell, (draftCell) => {
      draftCell.data.property.value = [...valuesArray, text.trim()];
    });
    onChange(newCell);
  };

  const removeItem = (index: number) => {
    const newCell = produce(cell, (draftCell) => {
      draftCell.data.property.value = valuesArray.filter(
        (_, index2) => index !== index2,
      );
    });
    onChange(newCell);
  };

  return (
    <Box
      sx={(theme) => ({
        border: "1px solid",
        borderColor: theme.palette.gray[30],
        borderRadius: theme.borderRadii.lg,
        background: "white",
        px: 2,
        py: 1.5,
        display: "flex",
        flexWrap: "wrap",
        gap: 0.75,
      })}
    >
      {valuesArray.map((val, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <ValueChip key={index} value={val} onDelete={() => removeItem(index)} />
      ))}
      {!isAdding ? (
        <IconButton onClick={() => setIsAdding(true)} size="small">
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      ) : (
        <TextField
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoFocus
          placeholder="Start typing..."
          variant="standard"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.stopPropagation();

              const text = input.trim();
              if (text.length) {
                addItem(text);
              }

              setInput("");
              setIsAdding(false);
            }
          }}
        />
      )}
    </Box>
  );
};
