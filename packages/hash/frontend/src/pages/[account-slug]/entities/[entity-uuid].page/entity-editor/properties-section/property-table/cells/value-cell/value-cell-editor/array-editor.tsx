import { Box } from "@mui/material";
import produce from "immer";
import { useMemo, useRef, useState } from "react";
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
import { InlineTextEditor } from "./array-editor/inline-text-editor";

const NEW_ROW_KEY = "new";

export const ArrayEditor: ValueCellEditorComponent = ({
  value: cell,
  onChange,
}) => {
  const scrollableContainer = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const propertyVal = cell.data.property.value;
    const values = Array.isArray(propertyVal) ? propertyVal : [];

    const itemsArray: SortableItem[] = values.map((value, index) => ({
      index,
      id: `${index}_${String(value)}`,
      value,
    }));

    return itemsArray;
  }, [cell]);

  const [input, setInput] = useState("");
  const [selectedRow, setSelectedRow] = useState("");
  const [editingRow, setEditingRow] = useState(items.length ? "" : NEW_ROW_KEY);

  const addItem = (text: string) => {
    const newCell = produce(cell, (draftCell) => {
      draftCell.data.property.value = [
        ...items.map(({ value }) => value),
        text,
      ];
    });
    onChange(newCell);
  };

  const removeItem = (indexToRemove: number) => {
    const newCell = produce(cell, (draftCell) => {
      draftCell.data.property.value = items
        .filter((_, index) => indexToRemove !== index)
        .map(({ value }) => value);
    });
    onChange(newCell);
  };

  const updateItem = (indexToUpdate: number, value: string) => {
    setEditingRow("");

    if (!value.trim().length) {
      return removeItem(indexToUpdate);
    }

    const newCell = produce(cell, (draftCell) => {
      draftCell.data.property.value = items.map((item, index) =>
        indexToUpdate === index ? value : item.value,
      );
    });
    onChange(newCell);
  };

  const moveItem = (oldIndex: number, newIndex: number) => {
    setSelectedRow("");
    setEditingRow("");
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
        borderColor: "gray.30",
        borderRadius: theme.borderRadii.lg,
        background: "white",
        overflow: "hidden",
      })}
    >
      <Box
        ref={scrollableContainer}
        sx={{
          maxHeight: 300,
          overflowY: "auto",
          overflowX: "hidden",
          borderBottom: "1px solid",
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
                onEditClicked={(id) => setEditingRow(id)}
                onEditFinished={updateItem}
                editing={editingRow === item.id}
                selected={selectedRow === item.id}
                onSelect={(id) =>
                  setSelectedRow((prevId) => (id === prevId ? "" : id))
                }
              />
            ))}
          </SortableContext>
        </DndContext>
      </Box>

      {editingRow !== NEW_ROW_KEY ? (
        <AddAnotherButton
          title="Add Another Value"
          onClick={() => {
            setEditingRow(NEW_ROW_KEY);
            setSelectedRow("");
          }}
        />
      ) : (
        <InlineTextEditor
          value={input}
          onChange={(value) => setInput(value)}
          onEnterPressed={() => {
            if (input.trim().length) {
              addItem(input);
            }

            setInput("");
            setEditingRow("");

            // using setImmediate, so scroll happens after item is rendered
            setImmediate(() => {
              scrollableContainer.current?.scrollTo({
                top: scrollableContainer.current.scrollHeight,
              });
            });
          }}
        />
      )}
    </Box>
  );
};
