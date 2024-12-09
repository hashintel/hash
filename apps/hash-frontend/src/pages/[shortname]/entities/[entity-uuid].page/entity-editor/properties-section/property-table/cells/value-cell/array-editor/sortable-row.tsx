import type { JsonValue } from "@blockprotocol/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faCheck,
  faClose,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-types/ontology";
import {
  formatDataValue,
  getMergedDataTypeSchema,
} from "@local/hash-isomorphic-utils/data-types";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, Divider, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";

import { getEditorSpecs } from "../editor-specs";
import { BooleanInput } from "../inputs/boolean-input";
import { JsonInput } from "../inputs/json-input";
import { NumberOrTextInput } from "../inputs/number-or-text-input";
import { RowAction } from "./row-action";
import type { SortableItem } from "./types";
import { ValueChip } from "./value-chip";

interface SortableRowProps {
  item: SortableItem;
  selected?: boolean;
  onRemove?: (index: number) => void;
  onSelect?: (id: string) => void;
  onEditClicked?: (id: string) => void;
  editing: boolean;
  expectedTypes: ClosedDataTypeDefinition[];
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
}: SortableRowProps) => {
  const { id, value, index, dataType } = item;
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

  const schema = getMergedDataTypeSchema(dataType);

  if ("anyOf" in schema) {
    throw new Error(
      "Data types with different expected sets of constraints (anyOf) are not yet supported",
    );
  }

  const editorSpec = getEditorSpecs(dataType, schema);

  const { arrayEditException } = editorSpec;

  const shouldShowActions =
    !isDragging && !isSorting && (hovered || selected || editing);

  if (prevEditing !== editing) {
    setPrevEditing(editing);
    setDraftValue(value);
  }

  const textInputFormRef = useRef<HTMLFormElement>(null);

  const saveChanges = () => {
    if (!["object", "boolean"].includes(schema.type)) {
      /**
       * We want form validation triggered when the user tries to add a text or number value
       */
      textInputFormRef.current?.requestSubmit();
    } else {
      onSaveChanges(index, draftValue);
    }
  };

  const renderEditor = () => {
    if (schema.type === "boolean") {
      return (
        <BooleanInput
          showChange
          value={!!draftValue}
          onChange={setDraftValue}
        />
      );
    }

    if (schema.type === "object") {
      return (
        <JsonInput
          value={draftValue}
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
        isNumber={schema.type === "number"}
        onEnterPressed={saveChanges}
        /** @todo is this casting ok? */
        value={draftValue as number | string}
        schema={schema}
        onChange={setDraftValue}
      />
    );
  };

  const renderValue = () => {
    if (schema.type === "boolean") {
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
        title={
          <Stack direction="row">
            {formatDataValue(value as JsonValue, schema).map((part, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <Box component="span" key={idx} sx={{ color: part.color }}>
                {part.text}
              </Box>
            ))}
          </Stack>
        }
        selected={!!selected}
        icon={{ icon: editorSpec.icon }}
        tooltip={dataType.title}
      />
    );
  };

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      sx={{
        minHeight: 48,
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
        <Box
          component="form"
          ref={textInputFormRef}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSaveChanges(index, draftValue);
          }}
        >
          {renderEditor()}
        </Box>
      ) : (
        renderValue()
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
              arrayEditException !== "no-save-and-discard-buttons" && (
                <>
                  <RowAction
                    tooltip="Save Changes"
                    icon={faCheck}
                    onClick={saveChanges}
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
