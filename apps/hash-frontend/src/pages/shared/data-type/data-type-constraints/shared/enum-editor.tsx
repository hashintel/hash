import type { StringFormat } from "@blockprotocol/type-system";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PenToSquareIcon } from "@hashintel/block-design-system";
import {
  CheckRegularIcon,
  CloseIcon,
  IconButton,
} from "@hashintel/design-system";
import type { MergedValueSchema } from "@local/hash-isomorphic-utils/data-types";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Tooltip, Typography } from "@mui/material";
import {
  Box,
  Stack,
  type fontSize,
  type SxProps,
  type Theme,
} from "@mui/system";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "../../../../../shared/ui";
import { NumberOrTextInput } from "../../../number-or-text-input";
import type { DataTypeFormData } from "../../data-type-form";
import type { InheritedConstraints } from "../types";
import { ItemLabel } from "./item-label";

const SaveButton = ({ onClick }: { onClick: () => void }) => (
  <Tooltip title="Save" placement="top">
    <IconButton
      onClick={onClick}
      sx={({ palette }) => ({
        "& svg": { fontSize: 12 },
        "&:hover": {
          background: "none",
          "& svg": { color: palette.green[70] },
        },
        p: 0.5,
      })}
      type="button"
    >
      <CheckRegularIcon
        sx={({ palette, transitions }) => ({
          color: palette.gray[40],
          transition: transitions.create("color"),
        })}
      />
    </IconButton>
  </Tooltip>
);

const DeleteOrCancelButton = ({
  onClick,
  type,
}: {
  onClick: () => void;
  type: "Delete" | "Cancel";
}) => (
  <Tooltip title={type} placement="top">
    <IconButton
      onClick={onClick}
      sx={({ palette }) => ({
        mt: 0.1,
        "& svg": { fontSize: 11 },
        "&:hover": {
          background: "none",
          "& svg": { fill: palette.red[70] },
        },
        p: 0.5,
      })}
      type="button"
    >
      <CloseIcon
        sx={({ palette, transitions }) => ({
          fill: palette.gray[40],
          transition: transitions.create("fill"),
        })}
      />
    </IconButton>
  </Tooltip>
);

const itemContainerStyles: SxProps<Theme> = ({ palette }) => ({
  background: palette.common.white,
  border: `1px solid ${palette.gray[20]}`,
  borderRadius: 1,
  px: 1,
  py: 0.6,
  flex: 0,
});

const EnumItem = ({
  onDelete,
  inheritedFrom,
  item,
  setEditing,
}: {
  onDelete: () => void;
  inheritedFrom?: string;
  item: number | string;
  setEditing: () => void;
}) => {
  const {
    attributes,
    isDragging,
    isSorting,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item,
  });

  return (
    <Stack
      alignItems="center"
      direction="row"
      justifyContent="space-between"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={itemContainerStyles}
      {...attributes}
    >
      <Stack direction="row" alignItems="center">
        <Box
          component="span"
          sx={{
            cursor: isDragging || isSorting ? "grabbing" : "grab",
            height: "100%",
            display: "flex",
            alignItems: "center",
            mr: 1,
          }}
          {...listeners}
        >
          <DragIndicatorIcon
            sx={{
              fontSize: 16,
              color: ({ palette }) => palette.gray[50],
            }}
          />
        </Box>
        <Typography
          variant="smallTextParagraphs"
          sx={{ lineHeight: 1, mr: 2, fontSize: 13 }}
        >
          {item}
        </Typography>
      </Stack>
      <Stack direction="row" alignItems="center" gap={0.2}>
        {!inheritedFrom && (
          <Tooltip title="Edit" placement="top">
            <IconButton
              onClick={() => setEditing()}
              sx={({ palette }) => ({
                "& svg": { fontSize: 12 },
                "&:hover": {
                  background: "none",
                  "& svg": { color: palette.gray[70] },
                },
                p: 0.5,
              })}
              type="button"
            >
              <PenToSquareIcon
                sx={({ palette, transitions }) => ({
                  color: palette.gray[40],
                  transition: transitions.create("color"),
                })}
              />
            </IconButton>
          </Tooltip>
        )}
        <DeleteOrCancelButton onClick={onDelete} type="Delete" />
      </Stack>
    </Stack>
  );
};

const EditingRow = ({
  mergedSchema,
  draftValue,
  setDraftValue,
  saveItem,
  setEditingIndex,
  type,
}: {
  mergedSchema: MergedValueSchema;
  draftValue: string | number | undefined;
  setDraftValue: (value: string | number | undefined) => void;
  saveItem: () => void;
  setEditingIndex: (index: number | null) => void;
  type: "string" | "number";
}) => (
  <Stack
    direction="row"
    alignItems="center"
    sx={[itemContainerStyles, { pl: 1.5, maxWidth: 200 }]}
  >
    <NumberOrTextInput
      fontSize={14}
      isNumber={type === "number"}
      onChange={(value) => {
        setDraftValue(value);
      }}
      schema={mergedSchema}
      value={draftValue}
    />
    <Stack direction="row" gap={0.2}>
      <SaveButton onClick={saveItem} />
      <DeleteOrCancelButton
        onClick={() => setEditingIndex(null)}
        type="Cancel"
      />
    </Stack>
  </Stack>
);

export const EnumEditor = <T extends string | number>({
  ownEnum,
  ownFormat,
  ownMinLength,
  ownMaxLength,
  ownMinimum,
  ownMaximum,
  ownExclusiveMinimum,
  ownExclusiveMaximum,
  ownMultipleOf,
  inheritedConstraints,
  type,
}: {
  ownEnum?: T[];
  ownFormat?: StringFormat;
  ownMinLength?: number;
  ownMaxLength?: number;
  ownMinimum?: number;
  ownMaximum?: number;
  ownExclusiveMinimum?: boolean;
  ownExclusiveMaximum?: boolean;
  ownMultipleOf?: number;
  inheritedConstraints: InheritedConstraints;
  type: "string" | "number";
}) => {
  const { setValue } = useFormContext<DataTypeFormData>();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftValue, setDraftValue] = useState<string | number | undefined>(
    undefined,
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items = ownEnum ?? inheritedConstraints.enum?.value ?? [];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = items.findIndex((value) => value === active.id);
      const newIndex = items.findIndex((value) => value === over?.id);

      const newItems = arrayMove(items as T[], oldIndex, newIndex);

      setValue("constraints.enum", newItems);
    }
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setValue("constraints.enum", newItems as T[]);
  };

  const saveItem = () => {
    if (editingIndex === null) {
      throw new Error("Editing index is null");
    }

    if (editingIndex === items.length) {
      setValue("constraints.enum", [...items, draftValue]);
    } else {
      const newItems = [...items];
      newItems[editingIndex] = draftValue as (typeof items)[number];
      setValue("constraints.enum", newItems);
    }

    setDraftValue(undefined);
    setEditingIndex(null);
  };

  const inheritedEnum = inheritedConstraints.enum;

  let tooltip = "Restrict to only these values.";

  if (inheritedEnum) {
    tooltip += `Parent type ${inheritedEnum.from.title} restricts values to ${inheritedEnum.value.map((value) => `'${value}'`).join(", ")}. Permitted values can be removed but not edited or added.`;
  }

  const mergedSchema: MergedValueSchema = {
    format: ownFormat ?? inheritedConstraints.format?.value,
    minimum: ownMinimum ?? inheritedConstraints.minimum?.value.value,
    maximum: ownMaximum ?? inheritedConstraints.maximum?.value.value,
    exclusiveMinimum:
      ownExclusiveMinimum ?? inheritedConstraints.minimum?.value.exclusive,
    exclusiveMaximum:
      ownExclusiveMaximum ?? inheritedConstraints.maximum?.value.exclusive,
    multipleOf: ownMultipleOf
      ? [ownMultipleOf]
      : inheritedConstraints.multipleOf?.map(({ value }) => value),
    minLength: ownMinLength ?? inheritedConstraints.minLength?.value,
    maxLength: ownMaxLength ?? inheritedConstraints.maxLength?.value,
    type,
  };

  return (
    <Stack>
      <Box>
        <ItemLabel tooltip={tooltip}>Permitted values</ItemLabel>
        <Stack
          sx={{
            maxHeight: 300,
            overflowY: "auto",
            overflowX: "hidden",
            mt: 0.5,
            width: "fit-content",
          }}
        >
          {items.length === 0 && (
            <Typography
              variant="smallTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[50], fontSize: 13 }}
            >
              Any value meeting the constraints will be allowed.
            </Typography>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap={1} sx={{ display: "inline-flex" }}>
                {items.map((item, index) =>
                  editingIndex === index ? (
                    <EditingRow
                      key={item}
                      mergedSchema={mergedSchema}
                      draftValue={draftValue}
                      saveItem={saveItem}
                      setDraftValue={setDraftValue}
                      setEditingIndex={setEditingIndex}
                      type={type}
                    />
                  ) : (
                    <EnumItem
                      key={item}
                      item={item}
                      onDelete={() => removeItem(index)}
                      setEditing={() => {
                        setEditingIndex(index);
                        setDraftValue(item);
                      }}
                    />
                  ),
                )}
              </Stack>
            </SortableContext>
          </DndContext>
          {!inheritedEnum && editingIndex === null && (
            <Button
              onClick={() => setEditingIndex(items.length)}
              size="xs"
              sx={{
                fontSize: 13,
                border: ({ palette }) => `1px solid ${palette.gray[20]}`,
                mt: 1,
              }}
              variant="tertiary"
            >
              Add value
            </Button>
          )}
        </Stack>
        {editingIndex === items.length && (
          <Box mt={1}>
            <EditingRow
              mergedSchema={mergedSchema}
              draftValue={draftValue}
              saveItem={saveItem}
              setDraftValue={setDraftValue}
              setEditingIndex={setEditingIndex}
              type={type}
            />
          </Box>
        )}
      </Box>
    </Stack>
  );
};
