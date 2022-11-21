import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { faClose, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Box, Divider, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useState } from "react";
import { SortableItem } from "./types";
import { ValueChip } from "./value-chip";

interface SortableRowProps {
  item: SortableItem;
  selected: boolean;
  onRemove: (index: number) => void;
  onSelect: (id: string) => void;
}

export const SortableRow = ({
  item,
  onRemove,
  selected,
  onSelect,
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [hovered, setHovered] = useState(false);

  const shouldShowActions = !isDragging && !isSorting && (hovered || selected);

  return (
    <Box
      ref={setNodeRef}
      style={style}
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
      <ValueChip value={value} selected={selected} />

      {shouldShowActions && (
        <Box
          sx={{
            display: "flex",
            position: "absolute",
            inset: 0,
            left: "unset",
            "::before": {
              content: `""`,
              width: 50,
              background: `linear-gradient(90deg, transparent 0%, white 100%)`,
            },
          }}
        >
          <Box sx={{ display: "flex", background: "white" }}>
            <IconButton
              onClick={() => onRemove(index)}
              sx={{ background: "white !important", width: 50 }}
              size="small"
            >
              <FontAwesomeIcon icon={faPencil} />
            </IconButton>
            <Divider orientation="vertical" />
            <IconButton
              onClick={() => onRemove(index)}
              sx={{ background: "white !important", width: 50 }}
              size="small"
            >
              <FontAwesomeIcon icon={faClose} />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
};
