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
import { ValueCellEditorComponent } from "./types";
import { SortableItem } from "./array-editor/types";
import { SortableRow } from "./array-editor/sortable-row";
import { AddAnotherButton } from "./array-editor/add-another-button";
import { DraftRow } from "./array-editor/draft-row";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";

export const DRAFT_ROW_KEY = "draft";

export const ArrayEditor: ValueCellEditorComponent = ({
  value: cell,
  onChange,
}) => {
  const scrollableContainer = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const propertyVal = cell.data.propertyRow.value;
    const values = Array.isArray(propertyVal) ? propertyVal : [];

    const itemsArray: SortableItem[] = values.map((value, index) => ({
      index,
      id: `${index}_${String(value)}`,
      value,
    }));

    return itemsArray;
  }, [cell]);

  const [selectedRow, setSelectedRow] = useState("");
  const [editingRow, setEditingRow] = useState(
    items.length ? "" : DRAFT_ROW_KEY,
  );

  const addItem = (value: unknown) => {
    setEditingRow("");

    /** @todo re-enable this code below to scroll down after a value is added */
    // using setImmediate, so scroll happens after item is rendered
    // setImmediate(() => {
    //   scrollableContainer.current?.scrollTo({
    //     top: scrollableContainer.current.scrollHeight,
    //   });
    // });

    const newCell = produce(cell, (draftCell) => {
      draftCell.data.propertyRow.value = [
        ...items.map((item) => item.value),
        value,
      ];
    });
    onChange(newCell);
  };

  const removeItem = (indexToRemove: number) => {
    const newCell = produce(cell, (draftCell) => {
      draftCell.data.propertyRow.value = items
        .filter((_, index) => indexToRemove !== index)
        .map(({ value }) => value);
    });
    onChange(newCell);
  };

  const updateItem = (indexToUpdate: number, value: unknown) => {
    setEditingRow("");

    /** @todo consider this? */
    // if (!value.trim().length) {
    //   return removeItem(indexToUpdate);
    // }

    const newCell = produce(cell, (draftCell) => {
      draftCell.data.propertyRow.value = items.map((item, index) =>
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

      draftCell.data.propertyRow.value = newItems.map(({ value }) => value);
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
    <GridEditorWrapper>
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
                onSaveChanges={updateItem}
                onDiscardChanges={() => setEditingRow("")}
                editing={editingRow === item.id}
                selected={selectedRow === item.id}
                onSelect={(id) =>
                  setSelectedRow((prevId) => (id === prevId ? "" : id))
                }
                expectedTypes={cell.data.propertyRow.expectedTypes}
              />
            ))}
          </SortableContext>
        </DndContext>
      </Box>

      {editingRow !== DRAFT_ROW_KEY ? (
        <AddAnotherButton
          title="Add Another Value"
          onClick={() => {
            setEditingRow(DRAFT_ROW_KEY);
            setSelectedRow("");
          }}
        />
      ) : (
        <DraftRow
          propertyRow={cell.data.propertyRow}
          onDraftSaved={(val) => {
            addItem(val);
          }}
          onDraftDiscarded={() => setEditingRow("")}
        />
      )}
    </GridEditorWrapper>
  );
};
