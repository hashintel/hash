import type { DraggableAttributes } from "@dnd-kit/core";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import LinkIcon from "@mui/icons-material/Link";
import type { SxProps } from "@mui/material";
import { Tooltip } from "@mui/material";
import type { CSSProperties, RefObject } from "react";
// @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
// removed React import
import { forwardRef, useState } from "react";

import {
  SButtonsWrapper,
  SIconButton,
  SLinkIconWrapper,
  SListItem,
  SPaper,
  STextField,
} from "./item.styled";

export type ItemProps = {
  id: string;
  value: string;
  isDragging?: boolean;
  onValueChange?: (value: string) => void;
  onItemBlur?: () => void;
  onDelete?: () => void;
  paperStyle?: SxProps;
  attributes?: DraggableAttributes;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- this matches the library type we get listeners from
  listeners?: Record<string, Function>;
  style?: CSSProperties;
  dragOverlay?: RefObject<HTMLDivElement | null>;
  linkedToEntity?: boolean;
  readonly?: boolean;
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
      linkedToEntity,
      readonly = false,
    },
    ref,
  ) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <SListItem
        ref={ref}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        disablePadding
        sx={{ ...style, opacity: isDragging ? 0 : 1 }}
        {...attributes}
      >
        <SPaper sx={paperStyle} ref={dragOverlay}>
          {linkedToEntity && (
            <Tooltip title="This item is linked to an entity">
              <SLinkIconWrapper>
                <LinkIcon fontSize="small" />
              </SLinkIconWrapper>
            </Tooltip>
          )}

          <STextField
            multiline
            fullWidth
            variant="standard"
            // editing is disabled if item is linked to an entity as well
            disabled={readonly || linkedToEntity}
            value={value}
            onChange={(event) => onValueChange?.(event.target.value)}
            onBlur={() => onItemBlur?.()}
            InputProps={{
              disableUnderline: true,
            }}
          />

          {!readonly && (
            <SButtonsWrapper>
              <SIconButton
                onClick={() => onDelete?.()}
                sx={({ palette }) => ({
                  opacity: (dragOverlay ?? isHovered) ? 1 : 0,
                  transition: ({ transitions }) =>
                    transitions.create("opacity"),
                  "&:focus-visible, :hover": {
                    opacity: 1,
                    background: dragOverlay ? "none" : palette.action.hover,
                  },
                })}
                disableFocusRipple
              >
                <CloseIcon fontSize="small" />
              </SIconButton>

              <SIconButton
                sx={({ palette }) => ({
                  background: dragOverlay ? palette.action.hover : "none",
                  "&:focus-visible": {
                    background: palette.action.hover,
                  },
                })}
                disableFocusRipple
                {...listeners}
              >
                <DragIndicatorIcon fontSize="small" color="action" />
              </SIconButton>
            </SButtonsWrapper>
          )}
        </SPaper>
      </SListItem>
    );
  },
);
