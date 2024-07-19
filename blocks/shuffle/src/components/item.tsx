import React, {
  type CSSProperties,
  type RefObject,
  forwardRef,
  useState,
} from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import LinkIcon from "@mui/icons-material/Link";
import { type SxProps, Tooltip } from "@mui/material";

import {
  SButtonsWrapper,
  SIconButton,
  SLinkIconWrapper,
  SListItem,
  SPaper,
  STextField,
} from "./item.styled";

export interface ItemProps {
  id: string;
  value: string;
  isDragging?: boolean;
  onValueChange?: (value: string) => void;
  onItemBlur?: () => void;
  onDelete?: () => void;
  paperStyle?: SxProps;
  attributes?: DraggableAttributes;
  // eslint-disable-next-line @typescript-eslint/ban-types -- this matches the library type we get listeners from
  listeners?: Record<string, Function>;
  style?: CSSProperties;
  dragOverlay?: RefObject<HTMLDivElement>;
  linkedToEntity?: boolean;
  readonly?: boolean;
}

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
      linkedToEntity,
      readonly = false,
    },
    ref,
  ) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <SListItem
        disablePadding
        ref={ref}
        sx={{ ...style, opacity: isDragging ? 0 : 1 }}
        onMouseOver={() => {
          setIsHovered(true);
        }}
        onMouseOut={() => {
          setIsHovered(false);
        }}
        {...attributes}
      >
        <SPaper sx={paperStyle} ref={dragOverlay}>
          {linkedToEntity && (
            <Tooltip title={"This item is linked to an entity"}>
              <SLinkIconWrapper>
                <LinkIcon fontSize={"small"} />
              </SLinkIconWrapper>
            </Tooltip>
          )}

          <STextField
            multiline
            fullWidth
            value={value}
            InputProps={{
              disableUnderline: true,
            }}
            onChange={(event) => onValueChange?.(event.target.value)}
            onBlur={() => onItemBlur?.()}
            variant="standard"
            // editing is disabled if item is linked to an entity as well
            disabled={readonly || linkedToEntity}
          />

          {!readonly && (
            <SButtonsWrapper>
              <SIconButton
                disableFocusRipple
                sx={({ palette }) => ({
                  opacity: (dragOverlay ?? isHovered) ? 1 : 0,
                  transition: ({ transitions }) =>
                    transitions.create("opacity"),
                  "&:focus-visible, :hover": {
                    opacity: 1,
                    background: dragOverlay ? "none" : palette.action.hover,
                  },
                })}
                onClick={() => onDelete?.()}
              >
                <CloseIcon fontSize={"small"} />
              </SIconButton>

              <SIconButton
                disableFocusRipple
                sx={({ palette }) => ({
                  background: dragOverlay ? palette.action.hover : "none",
                  "&:focus-visible": {
                    background: palette.action.hover,
                  },
                })}
                {...listeners}
              >
                <DragIndicatorIcon fontSize={"small"} color={"action"} />
              </SIconButton>
            </SButtonsWrapper>
          )}
        </SPaper>
      </SListItem>
    );
  },
);
