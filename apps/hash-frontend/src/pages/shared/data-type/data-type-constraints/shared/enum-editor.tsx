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
import { Box, Stack, type SxProps, type Theme } from "@mui/system";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { TriangleExclamationRegularIcon } from "../../../../../shared/icons/triangle-exclamation-regular-icon";
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
  position: "relative",
});

const EnumItem = ({
  error,
  isOnlyItem,
  onDelete,
  inheritedFromTitle,
  item,
  setEditing,
}: {
  error?: string;
  onDelete: () => void;
  inheritedFromTitle?: string;
  item: number | string;
  isOnlyItem: boolean;
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

  const isLastUnremovableItem = isOnlyItem && inheritedFromTitle;

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
        {!inheritedFromTitle && (
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
        )}
        <Typography
          variant="smallTextParagraphs"
          sx={{
            lineHeight: 1,
            mr: isLastUnremovableItem ? 0.5 : 2,
            fontSize: 13,
            ml: inheritedFromTitle ? 0.5 : 0,
          }}
        >
          {item}
        </Typography>
      </Stack>
      <Stack direction="row" alignItems="center" gap={0.2}>
        {!inheritedFromTitle && (
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
        {!isLastUnremovableItem && (
          <DeleteOrCancelButton onClick={onDelete} type="Delete" />
        )}
      </Stack>
      {error && (
        <Tooltip title={error} placement="top">
          <TriangleExclamationRegularIcon
            sx={{
              fontSize: 14,
              color: ({ palette }) => palette.red[70],
              position: "absolute",
              right: -25,
            }}
          />
        </Tooltip>
      )}
    </Stack>
  );
};

const EditingRow = ({
  draftValue,
  mergedSchema,
  saveItem,
  setDraftValue,
  setEditingIndex,
  type,
}: {
  draftValue: string | number;
  mergedSchema: MergedValueSchema;
  saveItem: () => void;
  setDraftValue: (value: string | number) => void;
  setEditingIndex: (index: number | null) => void;
  type: "string" | "number";
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const valid = inputRef.current?.checkValidity();
    if (valid) {
      saveItem();
    } else {
      inputRef.current?.reportValidity();
    }
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={[itemContainerStyles, { pl: 1.5, maxWidth: 260 }]}
    >
      <NumberOrTextInput
        fontSize={14}
        inputRef={inputRef}
        isNumber={type === "number"}
        onChange={(value) => {
          setDraftValue(value ?? "");
        }}
        onEnterPressed={submit}
        onEscapePressed={() => setEditingIndex(null)}
        schema={mergedSchema}
        value={draftValue}
      />
      <Stack direction="row" gap={0.2}>
        <SaveButton onClick={submit} />
        <DeleteOrCancelButton
          onClick={() => setEditingIndex(null)}
          type="Cancel"
        />
      </Stack>
    </Stack>
  );
};

const emailRegExp = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const yyyymmddRegExp = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const dateTimeRegExp =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(Z|[+-][01]\d:[0-5]\d)?$/;

export const EnumEditor = ({
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
  ownEnum?: [string, ...string[]] | [number, ...number[]];
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
  const { clearErrors, setError, setValue, formState } =
    useFormContext<DataTypeFormData>();

  const errors = formState.errors;

  const items = ownEnum ?? inheritedConstraints.enum?.value;

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftValue, setDraftValue] = useState<string | number>("");

  useEffect(() => {
    if (editingIndex !== null && editingIndex > (items?.length ?? 0)) {
      setEditingIndex(null);
    }
  }, [editingIndex, items?.length]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!items) {
      throw new Error("Items array is undefined");
    }

    if (active.id !== over?.id) {
      const oldIndex = items.findIndex((value) => value === active.id);
      const newIndex = items.findIndex((value) => value === over?.id);

      const newItems = arrayMove(
        items as string[],
        oldIndex,
        newIndex,
      ) as typeof items;

      if (newItems.length > 0) {
        setValue("constraints.enum", newItems, { shouldDirty: true });
      } else {
        throw new Error("New items array is empty");
      }
    }
  };

  const removeItem = (index: number) => {
    if (!items) {
      throw new Error("Items array is undefined");
    }

    const newItems = items.filter((_, i) => i !== index);

    if (newItems.length > 0) {
      setValue("constraints.enum", newItems as typeof items, {
        shouldDirty: true,
      });
      clearErrors(`constraints.enum.${index}`);
    } else {
      // @ts-expect-error -- we can't send an empty array for enum
      setValue("constraints.enum", undefined, { shouldDirty: true });
      clearErrors("constraints.enum");
    }
  };

  const saveItem = () => {
    if (editingIndex === null) {
      throw new Error("Editing index is null");
    }

    if (!draftValue) {
      setEditingIndex(null);
      return;
    }

    if (!items?.length || editingIndex === items.length) {
      const newItems = [...(items ?? []), draftValue] as NonNullable<
        typeof items
      >;
      setValue("constraints.enum", newItems, { shouldDirty: true });

      setDraftValue("");
      setEditingIndex(newItems.length);
    } else {
      const newItems = [...items];
      newItems[editingIndex] = draftValue;
      setValue("constraints.enum", newItems as NonNullable<typeof items>, {
        shouldDirty: true,
      });

      setDraftValue("");
      setEditingIndex(null);
    }
  };

  const inheritedEnum = inheritedConstraints.enum;

  let tooltip: string | ReactElement = "Restrict to only these values.";

  if (inheritedEnum) {
    tooltip = (
      <Stack gap={1}>
        <Box>
          {`Parent type ${inheritedEnum.from.title} restricts values to `}
          {inheritedEnum.value.map((value) => `'${value}'`).join(", ")}.
        </Box>
        <Box>Permitted values can be removed, but not amended or added.</Box>
      </Stack>
    );
  }

  const mergedSchema: MergedValueSchema = useMemo(
    () => ({
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
    }),
    [
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
    ],
  );

  useEffect(() => {
    for (const [index, value] of (items ?? []).entries()) {
      if (mergedSchema.type === "string") {
        if (typeof value !== "string") {
          setError(`constraints.enum.${index}`, {
            message: "Value must be a string",
          });
          continue;
        }
        if (
          typeof mergedSchema.minLength !== "undefined" &&
          value.length < mergedSchema.minLength
        ) {
          setError(`constraints.enum.${index}`, {
            message: `Value must be at least ${mergedSchema.minLength} characters`,
          });
          continue;
        }
        if (
          typeof mergedSchema.maxLength !== "undefined" &&
          value.length > mergedSchema.maxLength
        ) {
          setError(`constraints.enum.${index}`, {
            message: `Value must be at most ${mergedSchema.maxLength} characters`,
          });
          continue;
        }
        if (mergedSchema.format === "email" && !emailRegExp.test(value)) {
          setError(`constraints.enum.${index}`, {
            message: "Value must be a valid email address",
          });
          continue;
        }
        if (
          mergedSchema.format === "date-time" &&
          !dateTimeRegExp.test(value)
        ) {
          setError(`constraints.enum.${index}`, {
            message: "Value must be a valid date & time in ISO 8601 format",
          });
          continue;
        }
        if (mergedSchema.format === "date" && !yyyymmddRegExp.test(value)) {
          setError(`constraints.enum.${index}`, {
            message: "Value must be a valid date in YYYY-MM-DD format",
          });
          continue;
        }
        if (mergedSchema.format === "uri") {
          try {
            void new URL(value);
          } catch {
            setError(`constraints.enum.${index}`, {
              message: "Value must be a valid URL",
            });
            continue;
          }
        }
        if (mergedSchema.pattern) {
          const failedPattern = mergedSchema.pattern.find(
            (pattern) => !new RegExp(pattern).test(value),
          );
          if (failedPattern) {
            setError(`constraints.enum.${index}`, {
              message: `Value must match the RegExp pattern: ${failedPattern}`,
            });
            continue;
          }
        }

        clearErrors(`constraints.enum.${index}`);
      }
      if (mergedSchema.type === "number") {
        if (typeof value !== "number") {
          setError(`constraints.enum.${index}`, {
            message: "Value must be a number",
          });
          continue;
        }
        if (typeof mergedSchema.minimum !== "undefined") {
          if (mergedSchema.exclusiveMinimum && value <= mergedSchema.minimum) {
            setError(`constraints.enum.${index}`, {
              message: `Value must be greater than ${mergedSchema.minimum}`,
            });
            continue;
          }
          if (!mergedSchema.exclusiveMinimum && value < mergedSchema.minimum) {
            setError(`constraints.enum.${index}`, {
              message: `Value must be greater than or equal to ${mergedSchema.minimum}`,
            });
            continue;
          }
        }
        if (typeof mergedSchema.maximum !== "undefined") {
          if (mergedSchema.exclusiveMaximum && value >= mergedSchema.maximum) {
            setError(`constraints.enum.${index}`, {
              message: `Value must be less than ${mergedSchema.maximum}`,
            });
            continue;
          }
          if (!mergedSchema.exclusiveMaximum && value > mergedSchema.maximum) {
            setError(`constraints.enum.${index}`, {
              message: `Value must be less than or equal to ${mergedSchema.maximum}`,
            });
            continue;
          }
        }
        clearErrors(`constraints.enum.${index}`);
      }
    }
  }, [items, mergedSchema, setError, clearErrors]);

  return (
    <Stack>
      <Box>
        <ItemLabel tooltip={tooltip}>Permitted values</ItemLabel>
        <Stack
          sx={{
            mt: 0.8,
            width: "fit-content",
          }}
        >
          {editingIndex === null && !items?.length && (
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
              items={items ?? []}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap={1} sx={{ display: "inline-flex" }}>
                {(items ?? []).map((item, index) =>
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
                      error={
                        errors.constraints &&
                        "enum" in errors.constraints &&
                        Array.isArray(errors.constraints.enum)
                          ? errors.constraints.enum[index]?.message
                          : undefined
                      }
                      key={item}
                      inheritedFromTitle={inheritedEnum?.from.title}
                      isOnlyItem={items?.length === 1}
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
              onClick={() => setEditingIndex(items?.length ?? 0)}
              size="xs"
              sx={{
                fontSize: 13,
                border: ({ palette }) => `1px solid ${palette.gray[20]}`,
                mt: 1,
              }}
              type="button"
              variant="tertiary"
            >
              Add value
            </Button>
          )}
        </Stack>
        {editingIndex === (items?.length ?? 0) && (
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
