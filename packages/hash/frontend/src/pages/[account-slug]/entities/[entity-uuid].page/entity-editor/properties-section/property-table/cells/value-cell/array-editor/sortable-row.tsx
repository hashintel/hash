import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faCheck,
  faClose,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { Box, Divider, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useState } from "react";
import { SortableItem } from "./types";
import { ValueChip } from "./value-chip";
import { RowAction } from "./row-action";
import { InlineTextEditor } from "./inline-text-editor";
import { faText } from "../../../../../../../../../../shared/icons/pro/fa-text";

interface SortableRowProps {
  item: SortableItem;
  selected: boolean;
  onRemove: (index: number) => void;
  onSelect: (id: string) => void;
  onEditClicked: (id: string) => void;
  onEditFinished: (index: number, value: string) => void;
  editing: boolean;
}

export const SortableRow = ({
  item,
  onRemove,
  selected,
  onSelect,
  onEditClicked,
  onEditFinished,
  editing,
}: SortableRowProps) => {
  const { id, value, index } = item;
  const {
    attributes,
    isDragging,
    isSorting,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id,
    animateLayoutChanges: undefined,
  });

  const [hovered, setHovered] = useState(false);
  const [draftValue, setDraftValue] = useState(String(value));
  const [prevEditing, setPrevEditing] = useState(editing);

  const shouldShowActions =
    !isDragging && !isSorting && (hovered || selected || editing);

  if (prevEditing !== editing) {
    setPrevEditing(editing);
    setDraftValue(String(value));
  }

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      sx={{
        height: 48,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid",
        borderColor: isDragging ? "transparent" : "gray.20",
        position: "relative",
        outline: "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(id)}
    >
      <Box
        {...listeners}
        sx={{
          cursor: isDragging || isSorting ? "grabbing" : "grab",
          px: 1.5,
          height: "100%",
          display: "flex",
          alignItems: "center",
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 14, color: "gray.50" }} />
      </Box>

      <Typography
        variant="smallTextLabels"
        sx={{
          color: "gray.50",
          mr: 1,
        }}
      >
        {index + 1}
      </Typography>

      {editing ? (
        <InlineTextEditor
          value={draftValue}
          onChange={(val) => {
            setDraftValue(val);
          }}
          onEnterPressed={() => {
            onEditFinished(index, draftValue);
          }}
        />
      ) : (
        <ValueChip
          value={value}
          selected={selected}
          icon={{ icon: faText }}
          tooltip="Text"
        />
      )}

      {shouldShowActions && (
        <Box
          display="flex"
          sx={[
            !editing && {
              position: "absolute",
              inset: 0,
              left: "unset",
              "::before": {
                content: `""`,
                width: 50,
                background: `linear-gradient(90deg, transparent 0%, white 100%)`,
              },
            },
          ]}
        >
          <Box sx={{ display: "flex", background: "white" }}>
            {editing ? (
              <>
                <RowAction
                  tooltip="Save Changes"
                  icon={faCheck}
                  onClick={() => onEditFinished(index, draftValue)}
                />
                <Divider orientation="vertical" />
                <RowAction
                  tooltip="Discard Changes"
                  icon={faClose}
                  onClick={() => onEditFinished(index, String(value))}
                />
              </>
            ) : (
              <>
                <RowAction
                  tooltip="Edit"
                  icon={faPencil}
                  onClick={() => onEditClicked(id)}
                />
                <Divider orientation="vertical" />
                <RowAction
                  tooltip="Delete"
                  icon={faTrash}
                  onClick={() => onRemove(index)}
                />
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
