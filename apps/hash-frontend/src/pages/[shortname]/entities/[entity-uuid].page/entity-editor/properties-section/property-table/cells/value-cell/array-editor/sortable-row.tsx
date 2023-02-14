import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faCheck,
  faClose,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, Divider, Typography } from "@mui/material";
import { useState } from "react";

import { editorSpecs } from "../editor-specs";
import { BooleanInput } from "../inputs/boolean-input";
import { JsonInput } from "../inputs/json-input";
import { NumberOrTextInput } from "../inputs/number-or-text-input";
import { guessEditorTypeFromValue } from "../utils";
import { RowAction } from "./row-action";
import { SortableItem } from "./types";
import { ValueChip } from "./value-chip";

interface SortableRowProps {
  item: SortableItem;
  selected?: boolean;
  onRemove?: (index: number) => void;
  onSelect?: (id: string) => void;
  onEditClicked?: (id: string) => void;
  editing: boolean;
  expectedTypes: string[];
  onSaveChanges: (index: number, value: unknown) => void;
  onDiscardChanges: () => void;
}

export const SortableRow = ({
  item,
  onRemove,
  selected,
  onSelect,
  onEditClicked,
  onSaveChanges,
  onDiscardChanges,
  editing,
  expectedTypes,
}: SortableRowProps) => {
  const { id, value, index, overriddenEditorType } = item;
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
  const [draftValue, setDraftValue] = useState(value);
  const [prevEditing, setPrevEditing] = useState(editing);

  const editorType =
    overriddenEditorType ?? guessEditorTypeFromValue(value, expectedTypes);

  const editorSpec = editorSpecs[editorType];

  const { arrayEditException } = editorSpec;

  const shouldShowActions =
    !isDragging && !isSorting && (hovered || selected || editing);

  if (prevEditing !== editing) {
    setPrevEditing(editing);
    setDraftValue(value);
  }

  const renderEditor = () => {
    if (editorType === "boolean") {
      return (
        <BooleanInput
          showChange
          value={!!draftValue}
          onChange={setDraftValue}
        />
      );
    }

    if (editorType === "object") {
      return (
        <JsonInput
          value={draftValue as any}
          onChange={(newValue, isDiscarded) => {
            if (isDiscarded) {
              onDiscardChanges();
            } else {
              onSaveChanges(index, newValue);
            }
          }}
        />
      );
    }

    return (
      <NumberOrTextInput
        isNumber={editorType === "number"}
        /** @todo is this casting ok? */
        value={draftValue as number | string}
        onChange={setDraftValue}
        onEnterPressed={() => onSaveChanges(index, draftValue)}
      />
    );
  };

  const renderValue = () => {
    if (editorType === "boolean") {
      return (
        <BooleanInput
          showChange={shouldShowActions}
          value={!!draftValue}
          onChange={setDraftValue}
        />
      );
    }

    return (
      <ValueChip
        title={editorSpec.valueToString(value)}
        selected={!!selected}
        icon={{ icon: editorSpec.icon }}
        tooltip={editorSpec.title}
      />
    );
  };

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
      onClick={() => onSelect?.(id)}
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

      {editing ? renderEditor() : renderValue()}

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
              arrayEditException !== "no-save-and-discard-buttons" && (
                <>
                  <RowAction
                    tooltip="Save Changes"
                    icon={faCheck}
                    onClick={() => onSaveChanges(index, draftValue)}
                  />
                  <Divider orientation="vertical" />
                  <RowAction
                    tooltip="Discard Changes"
                    icon={faClose}
                    onClick={() => onDiscardChanges()}
                  />
                </>
              )
            ) : (
              <>
                {arrayEditException !== "no-edit-mode" && (
                  <>
                    <RowAction
                      tooltip="Edit"
                      icon={faPencil}
                      onClick={() => onEditClicked?.(id)}
                    />
                    <Divider orientation="vertical" />
                  </>
                )}
                <RowAction
                  tooltip="Delete"
                  icon={faTrash}
                  onClick={() => onRemove?.(index)}
                />
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
