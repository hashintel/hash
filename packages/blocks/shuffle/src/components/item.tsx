import React from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import DragHandleIcon from "@mui/icons-material/DragHandle";
import { Box, IconButton, ListItem, TextField } from "@mui/material";
import { FunctionComponent } from "react";
import { Draggable } from "react-beautiful-dnd";

type ItemProps = {
  id: string;
  index: number;
  value: string;
  onValueChange: (value: string) => void;
  onDelete: () => void;
};

export const Item: FunctionComponent<ItemProps> = ({
  id,
  index,
  value,
  onValueChange,
  onDelete,
}) => (
  <Draggable key={id} draggableId={id} index={index}>
    {(provided, snapshot) => (
      <ListItem ref={provided.innerRef} {...provided.draggableProps}>
        <Box sx={{ marginRight: 1 }} {...provided.dragHandleProps}>
          <DragHandleIcon />
        </Box>
        <TextField
          multiline
          fullWidth
          variant="standard"
          sx={{ border: "none", outline: "none" }}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          InputProps={{
            disableUnderline: true,
          }}
        />
        <IconButton onClick={() => onDelete()}>
          <DeleteIcon />
        </IconButton>
      </ListItem>
    )}
  </Draggable>
);
