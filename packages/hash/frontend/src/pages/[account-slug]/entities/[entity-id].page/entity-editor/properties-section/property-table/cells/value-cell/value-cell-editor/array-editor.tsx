import { TextField } from "@hashintel/hash-design-system";
import { Box } from "@mui/material";
import produce from "immer";
import { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ValueCellEditorComponent } from "../types";
import { SortableItem } from "./array-editor/types";
import { SortableRow } from "./array-editor/sortable-row";
import { AddAnotherButton } from "./array-editor/add-another-button";

export const ArrayEditor: ValueCellEditorComponent = ({
  value: cell,
  onChange,
}) => {
  const items = useMemo(() => {
    const propertyVal = cell.data.property.value;
    const values = Array.isArray(propertyVal) ? propertyVal : [propertyVal];

    const itemsArray: SortableItem[] = values.map((value, index) => ({
      index,
      id: `${index}_${String(value)}`,
      value,
    }));

    return itemsArray;
  }, [cell]);

  const [isAdding, setIsAdding] = useState(!items.length);
  const [input, setInput] = useState("");
  const [selectedRow, setSelectedRow] = useState("");

  const addItem = (text: string) => {
    const newCell = produce(cell, (draftCell) => {
      draftCell.data.property.value = [
        ...items.map(({ value }) => value),
        text.trim(),
      ];
    });
    onChange(newCell);
  };

  const removeItem = (index: number) => {
    const newCell = produce(cell, (draftCell) => {
      draftCell.data.property.value = items
        .filter((_, index2) => index !== index2)
        .map(({ value }) => value);
    });
    onChange(newCell);
  };

  const moveItem = (oldIndex: number, newIndex: number) => {
    setSelectedRow("");
    const newCell = produce(cell, (draftCell) => {
      const newItems = arrayMove(items, oldIndex, newIndex);

      draftCell.data.property.value = newItems.map(({ value }) => value);
    });
    onChange(newCell);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <Box
      sx={(theme) => ({
        border: "1px solid",
        borderColor: theme.palette.gray[30],
        borderRadius: theme.borderRadii.lg,
        background: "white",
        overflow: "hidden",
      })}
    >
      <Box
        sx={{
          maxHeight: 300,
          overflowY: "scroll",
          overflowX: "hidden",
          borderBottom: `1px solid`,
          borderColor: "gray.20",
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => {
            const { active, over } = event;

            if (active.id !== over?.id) {
              const oldIndex = items.findIndex(({ id }) => id === active.id);
              const newIndex = items.findIndex(({ id }) => id === over?.id);
              moveItem(oldIndex, newIndex);
            }
          }}
        >
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                onRemove={removeItem}
                selected={selectedRow === item.id}
                onSelect={(id) =>
                  setSelectedRow((prevId) => (id === prevId ? "" : id))
                }
              />
            ))}
          </SortableContext>
        </DndContext>
      </Box>

      {!isAdding ? (
        <AddAnotherButton onClick={() => setIsAdding(true)} />
      ) : (
        <TextField
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoFocus
          placeholder="Start typing..."
          variant="standard"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.stopPropagation();

              const text = input.trim();
              if (text.length) {
                addItem(text);
              }

              setInput("");
              setIsAdding(false);
            }
          }}
          sx={{ p: 2, width: "100%" }}
        />
      )}
    </Box>
  );
};
