import React, { FunctionComponent, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, IconButton, ListItem, TextField, Paper } from "@mui/material";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ItemProps = {
  id: string;
  value: string;
  isDragging?: boolean;
  onValueChange?: (value: string) => void;
  onItemBlur?: () => void;
  onAdd?: () => void;
  onDelete?: () => void;
};

export const Item: FunctionComponent<ItemProps> = ({
  id,
  value,
  isDragging,
  onValueChange,
  onItemBlur,
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
      style={{
        ...style,
        opacity: isDragging ? 0 : 1,
      }}
      {...attributes}
    >
      <Paper
        sx={{
          display: "flex",
          width: 1,
          paddingX: 2,
          paddingY: 1,
          background: ({ palette }) => palette.grey[50],
        }}
        elevation={2}
      >
        <TextField
          multiline
          fullWidth
          variant="standard"
          sx={{ border: "none", outline: "none" }}
          value={value}
          onChange={(event) => onValueChange?.(event.target.value)}
          onBlur={() => onItemBlur?.()}
          InputProps={{
            disableUnderline: true,
          }}
        />

        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              opacity: isDragging || isHovered ? 1 : 0,
              transition: ({ transitions }) => transitions.create("opacity"),
            }}
          >
            <IconButton
              sx={{
                paddingX: 0.5,
                paddingY: 1,
                borderRadius: 1,
                maxHeight: 40,
              }}
              onClick={() => onAdd?.()}
            >
              <AddIcon fontSize="small" />
            </IconButton>

            <IconButton
              onClick={() => onDelete?.()}
              sx={{
                paddingX: 0.5,
                paddingY: 1,
                borderRadius: 1,
                maxHeight: 40,
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <IconButton
            sx={{
              paddingX: 0.5,
              paddingY: 1,
              borderRadius: 1,
              marginLeft: 1,
              maxHeight: 40,
            }}
            {...listeners}
          >
            <DragIndicatorIcon fontSize="small" color="action" />
          </IconButton>
        </Box>
      </Paper>
    </ListItem>
  );
};
