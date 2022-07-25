import React, { FunctionComponent, useState } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, IconButton, ListItem, TextField } from "@mui/material";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ItemProps = {
  id: string;
  value: string;
  isDragging?: boolean;
  onValueChange?: (value: string) => void;
  onAdd?: () => void;
  onDelete?: () => void;
};

export const Item: FunctionComponent<ItemProps> = ({
  id,
  value,
  isDragging,
  onValueChange,
  onAdd,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [isHovered, setIsHovered] = useState(false);

  return (
    <ListItem
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
      sx={{ marginBottom: 1 }}
      disablePadding
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0 : 1 }}
      {...attributes}
    >
      <Box
        sx={{
          marginRight: 1,
          opacity: isHovered || isDragging ? 1 : 0,
        }}
        {...listeners}
      >
        <DragIndicatorIcon fontSize="small" color="action" />
      </Box>
      <TextField
        multiline
        fullWidth
        variant="standard"
        sx={{ border: "none", outline: "none" }}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        InputProps={{
          disableUnderline: true,
        }}
      />
      <Box sx={{ display: "flex", opacity: isHovered || isDragging ? 1 : 0 }}>
        <IconButton onClick={() => onAdd?.()}>
          <AddIcon fontSize="small" color="primary" />
        </IconButton>
        <IconButton onClick={() => onDelete?.()}>
          <DeleteIcon fontSize="small" color="warning" />
        </IconButton>
      </Box>
    </ListItem>
  );
};
