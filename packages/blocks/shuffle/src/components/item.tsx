import React, { forwardRef, useState, CSSProperties, RefObject } from "react";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  Box,
  IconButton,
  ListItem,
  TextField,
  Paper,
  SxProps,
} from "@mui/material";
import { DraggableAttributes } from "@dnd-kit/core";

export type ItemProps = {
  id: string;
  value: string;
  isDragging?: boolean;
  onValueChange?: (value: string) => void;
  onItemBlur?: () => void;
  onDelete?: () => void;
  paperStyle?: SxProps;
  attributes?: DraggableAttributes;
  listeners?: Record<string, Function>;
  style?: CSSProperties;
  dragOverlay?: RefObject<HTMLDivElement>;
};

export const Item = forwardRef<HTMLLIElement, ItemProps>(
  (
    {
      value,
      isDragging,
      onValueChange,
      onItemBlur,
      onDelete,
      paperStyle,
      attributes,
      style,
      listeners,
      dragOverlay,
    },
    ref,
  ) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <ListItem
        ref={ref}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        disablePadding
        sx={{
          ...style,
          marginBottom: 2,
          opacity: isDragging ? 0 : 1,
          outlineColor: ({ palette }) => palette.primary.light,
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
            ...paperStyle,
          }}
          ref={dragOverlay}
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
            <IconButton
              onClick={() => onDelete?.()}
              sx={({ palette }) => ({
                paddingX: 0.5,
                paddingY: 1,
                borderRadius: 1,
                maxHeight: 40,
                opacity: dragOverlay || isHovered ? 1 : 0,
                transition: ({ transitions }) => transitions.create("opacity"),
                "&:focus-visible, :hover": {
                  opacity: 1,
                  background: dragOverlay ? "none" : palette.action.hover,
                },
              })}
              disableFocusRipple
            >
              <CloseIcon fontSize="small" />
            </IconButton>

            <IconButton
              sx={({ palette }) => ({
                paddingX: 0.5,
                paddingY: 1,
                borderRadius: 1,
                marginLeft: 1,
                maxHeight: 40,
                background: dragOverlay ? palette.action.hover : "none",
                "&:focus-visible": {
                  background: palette.action.hover,
                },
              })}
              disableFocusRipple
              {...listeners}
            >
              <DragIndicatorIcon fontSize="small" color="action" />
            </IconButton>
          </Box>
        </Paper>
      </ListItem>
    );
  },
);
