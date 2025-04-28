import type { JsonValue } from "@blockprotocol/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faCheck,
  faClose,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";
import {
  formatDataValue,
  getMergedDataTypeSchema,
} from "@local/hash-isomorphic-utils/data-types";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, Divider, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";

import { NumberOrTextInput } from "../../../../../../../number-or-text-input";
import { getEditorSpecs } from "../editor-specs";
import { BooleanInput } from "../inputs/boolean-input";
import { JsonInput } from "../inputs/json-input";
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
  isLastRow: boolean;
  onSaveChanges: (index: number, value: unknown) => void;
  onDiscardChanges: () => void;
  readonly: boolean;
}

export const SortableRow = ({
  isLastRow,
  item,
  onRemove,
  selected,
  onSelect,
  onEditClicked,
  onSaveChanges,
  onDiscardChanges,
  editing,
  readonly,
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

  const schema = getMergedDataTypeSchema(dataType);

  const editorSpec =
    "anyOf" in schema ? undefined : getEditorSpecs(dataType, schema);

  const [hovered, setHovered] = useState(false);
  const [draftValue, setDraftValue] = useState(
    value === undefined ? editorSpec?.defaultValue : value,
  );
  const [prevEditing, setPrevEditing] = useState(editing);

  if ("anyOf" in schema || !editorSpec) {
    /**
     * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
     */
    throw new Error(
      "Data types with different expected sets of constraints (anyOf) are not yet supported",
    );
  }

  const { arrayEditException } = editorSpec;

  const shouldShowActions =
    !readonly && !isDragging && !isSorting && (hovered || selected || editing);

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
        multiLineText={schema.type === "string"}
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
        borderBottom: isLastRow ? "none" : "1px solid",
        borderColor: isDragging ? "transparent" : "gray.20",
        position: "relative",
        outline: "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect?.(id)}
    >
      {!readonly && (
        <Box
          {...listeners}
          sx={{
            cursor: isDragging || isSorting ? "grabbing" : "grab",
            pl: 1.5,
            height: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          <DragIndicatorIcon sx={{ fontSize: 14, color: "gray.50" }} />
        </Box>
      )}

      <Typography
        variant="smallTextLabels"
        sx={{
          color: "gray.50",
          ml: 1.5,
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
