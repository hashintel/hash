import React, { useState } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, IconButton, ListItem, TextField } from "@mui/material";
import { FunctionComponent } from "react";
import { Draggable } from "react-beautiful-dnd";

type ItemProps = {
  id: string;
  index: number;
  value: string;
  canHover: boolean;
  onValueChange: (value: string) => void;
  onAdd: () => void;
  onDelete: () => void;
};

export const Item: FunctionComponent<ItemProps> = ({
  id,
  index,
  value,
  canHover,
  onValueChange,
  onAdd,
  onDelete,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Draggable key={id} draggableId={id} index={index}>
      {(provided, { isDragging }) => (
        <ListItem
          ref={provided.innerRef}
          onMouseOver={() => canHover && setIsHovered(true)}
          onMouseOut={() => setIsHovered(false)}
          {...provided.draggableProps}
        >
          <Box
            sx={{
              marginRight: 1,
              opacity: isHovered || isDragging ? 1 : 0,
            }}
            {...provided.dragHandleProps}
          >
            <DragIndicatorIcon fontSize="small" color="action" />
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
          <Box
            sx={{ display: "flex", opacity: isHovered || isDragging ? 1 : 0 }}
          >
            <IconButton onClick={() => onAdd()}>
              <AddIcon fontSize="small" color="primary" />
            </IconButton>
            <IconButton onClick={() => onDelete()}>
              <DeleteIcon fontSize="small" color="warning" />
            </IconButton>
          </Box>
        </ListItem>
      )}
    </Draggable>
  );
};
