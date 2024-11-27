import type { JsonValue } from "@blockprotocol/core";
import type {
  ClosedDataType,
  ValueConstraints,
} from "@blockprotocol/type-system";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  faCheck,
  faClose,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { formatDataValue } from "@local/hash-isomorphic-utils/data-types";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, Divider, Typography } from "@mui/material";
import { useRef, useState } from "react";

import { getEditorSpecs } from "../editor-specs";
import { BooleanInput } from "../inputs/boolean-input";
import { JsonInput } from "../inputs/json-input";
import { NumberOrTextInput } from "../inputs/number-or-text-input";
import { guessEditorTypeFromValue } from "../utils";
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
  expectedTypes: ClosedDataType[];
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

  let valueConstraints: ValueConstraints;

  /** @todo H-3374 don't guess the type, take it from the data type metadata */
  /* eslint-disable no-labels */
  outerLoop: for (const expectedType of expectedTypes) {
    for (const constraint of expectedType.allOf) {
      if ("type" in constraint) {
        if (constraint.type === editorType) {
          valueConstraints = constraint;
          break outerLoop;
        }
      } else {
        for (const innerConstraint of constraint.anyOf) {
          if ("type" in innerConstraint) {
            if (innerConstraint.type === editorType) {
              valueConstraints = innerConstraint;
              break outerLoop;
            }
          }
        }
      }
    }
  }
  /* eslint-enable no-labels */

  const expectedType = expectedTypes.find((type) =>
    type.allOf.some((constraint) =>
      "type" in constraint
        ? constraint.type === editorType
        : /**
           * @todo H-3374 support multiple expected data types
           */
          constraint.anyOf.some((subType) => subType.type === editorType),
    ),
  );

  const editorSpec = getEditorSpecs(editorType, expectedType);

  const { arrayEditException } = editorSpec;

  const shouldShowActions =
    !isDragging && !isSorting && (hovered || selected || editing);

  if (prevEditing !== editing) {
    setPrevEditing(editing);
    setDraftValue(value);
  }

  const textInputFormRef = useRef<HTMLFormElement>(null);

  const saveChanges = () => {
    if (!["object", "boolean"].includes(editorType)) {
      /**
       * We want form validation triggered when the user tries to add a text or number value
       */
      textInputFormRef.current?.requestSubmit();
    } else {
      onSaveChanges(index, draftValue);
    }
  };

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

    if (!expectedType) {
      throw new Error(
        `Could not find guessed editor type ${editorType} among expected types ${expectedTypes
          .map((opt) => opt.$id)
          .join(", ")}`,
      );
    }

    return (
      <NumberOrTextInput
        isNumber={editorType === "number"}
        onEnterPressed={saveChanges}
        /** @todo is this casting ok? */
        value={draftValue as number | string}
        valueConstraints={valueConstraints}
        onChange={setDraftValue}
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

    if (!expectedType) {
      throw new Error(
        `Could not find guessed editor type ${editorType} among expected types ${expectedTypes
          .map((opt) => opt.$id)
          .join(", ")}`,
      );
    }

    return (
      <ValueChip
        title={formatDataValue(value as JsonValue, expectedType)
          .map((part) => part.text)
          .join("")}
        selected={!!selected}
        icon={{ icon: editorSpec.icon }}
        tooltip={expectedType.title}
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
