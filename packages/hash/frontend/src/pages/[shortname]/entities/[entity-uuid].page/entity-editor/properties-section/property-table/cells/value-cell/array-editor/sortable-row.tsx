import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faCheck,
  faClose,
  faPencil,
  faTrash,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { types } from "@hashintel/hash-shared/ontology-types";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, Divider, Typography } from "@mui/material";
import { useState } from "react";

import { fa100 } from "../../../../../../../../../../shared/icons/pro/fa-100";
import { faSquareCheck } from "../../../../../../../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../../../../../../../shared/icons/pro/fa-text";
import { BooleanInput } from "../inputs/boolean-input";
import { NumberOrTextInput } from "../inputs/number-or-text-input";
import { EditorType } from "../types";
import { guessEditorTypeFromValue } from "../utils";
import { RowAction } from "./row-action";
import { SortableItem } from "./types";
import { ValueChip } from "./value-chip";

export const editorSpecs: Record<
  EditorType,
  { icon: IconDefinition["icon"]; title: string; gridIcon: CustomIcon }
> = {
  boolean: {
    icon: faSquareCheck,
    title: types.dataType.boolean.title,
    gridIcon: "bpTypeBoolean",
  },
  number: {
    icon: fa100,
    title: types.dataType.number.title,
    gridIcon: "bpTypeNumber",
  },
  text: {
    icon: faText,
    title: types.dataType.text.title,
    gridIcon: "bpTypeText",
  },
};

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

  const isBooleanEditor = editorType === "boolean";
  const shouldShowActions =
    !isDragging && !isSorting && (hovered || selected || editing);

  if (prevEditing !== editing) {
    setPrevEditing(editing);
    setDraftValue(value);
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

      {editing ? (
        isBooleanEditor ? (
          <BooleanInput
            showChange
            value={!!draftValue}
            onChange={setDraftValue}
          />
        ) : (
          <NumberOrTextInput
            isNumber={editorType === "number"}
            /** @todo is this casting ok? */
            value={draftValue as number | string}
            onChange={setDraftValue}
            onEnterPressed={() => onSaveChanges(index, draftValue)}
          />
        )
      ) : isBooleanEditor ? (
        <BooleanInput
          showChange={shouldShowActions}
          value={!!draftValue}
          onChange={setDraftValue}
        />
      ) : (
        <ValueChip
          value={value}
          selected={!!selected}
          icon={{ icon: editorSpec.icon }}
          tooltip={editorSpec.title}
        />
      )}

      {shouldShowActions && !isBooleanEditor && (
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
                  onClick={() => onSaveChanges(index, draftValue)}
                />
                <Divider orientation="vertical" />
                <RowAction
                  tooltip="Discard Changes"
                  icon={faClose}
                  onClick={() => onDiscardChanges()}
                />
              </>
            ) : (
              <>
                <RowAction
                  tooltip="Edit"
                  icon={faPencil}
                  onClick={() => onEditClicked?.(id)}
                />
                <Divider orientation="vertical" />
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
