import {
  closestCenter,
  DndContext,
  DragEndEvent,
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
import { Box, styled } from "@mui/material";
import produce from "immer";
import { isNumber } from "lodash";
import { useMemo, useRef, useState } from "react";

import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { AddAnotherButton } from "./array-editor/add-another-button";
import { DraftRow } from "./array-editor/draft-row";
import { ItemLimitInfo } from "./array-editor/item-limit-info";
import { SortableRow } from "./array-editor/sortable-row";
import { SortableItem } from "./array-editor/types";
import { editorSpecs } from "./editor-specs";
import { ValueCellEditorComponent } from "./types";
import {
  guessEditorTypeFromExpectedType,
  isBlankStringOrNullish,
} from "./utils";

export const DRAFT_ROW_KEY = "draft";

const ListWrapper = styled(Box)(({ theme }) =>
  theme.unstable_sx({
    maxHeight: 300,
    overflowY: "auto",
    overflowX: "hidden",
    borderBottom: "1px solid",
    borderColor: "gray.20",
  }),
);

export const ArrayEditor: ValueCellEditorComponent = ({
  value: cell,
  onChange,
}) => {
  const listWrapperRef = useRef<HTMLDivElement>(null);
  const {
    value: propertyValue,
    expectedTypes,
    maxItems,
    minItems,
  } = cell.data.propertyRow;

  const items = useMemo(() => {
    const values = Array.isArray(propertyValue) ? propertyValue : [];

    const itemsArray: SortableItem[] = values.map((value, index) => ({
      index,
      id: `${index}_${String(value)}`,
      value,
    }));

    return itemsArray;
  }, [propertyValue]);

  const [selectedRow, setSelectedRow] = useState("");
  const [editingRow, setEditingRow] = useState(() => {
    // if there is no item, start in add item state
    if (items.length) {
      return "";
    }

    if (expectedTypes.length === 1) {
      const expectedType = guessEditorTypeFromExpectedType(expectedTypes[0]!);

      if (editorSpecs[expectedType].arrayEditException === "no-edit-mode") {
        return "";
      }
    }

    return DRAFT_ROW_KEY;
  });

  const toggleSelectedRow = (id: string) => {
    setSelectedRow((prevId) => (id === prevId ? "" : id));
  };

  const addItem = (value: unknown) => {
    setEditingRow("");

    const newCell = produce(cell, (draftCell) => {
      draftCell.data.propertyRow.value = [
        ...items.map((item) => item.value),
        value,
      ];
    });
    onChange(newCell);

    // using setImmediate, so scroll happens after item is rendered
    setImmediate(() => {
      listWrapperRef.current?.scrollTo({
        top: listWrapperRef.current.scrollHeight,
      });
    });
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = items.findIndex(({ id }) => id === active.id);
      const newIndex = items.findIndex(({ id }) => id === over?.id);
      moveItem(oldIndex, newIndex);
    }
  };

  const handleAddAnotherClick = () => {
    setSelectedRow("");

    const onlyOneExpectedType = expectedTypes.length === 1;
    const expectedType = expectedTypes[0]!;
    const editorType = guessEditorTypeFromExpectedType(expectedType);
    const editorSpec = editorSpecs[editorType];
    const noEditMode = editorSpec.arrayEditException === "no-edit-mode";

    // add the value on click instead of showing draftRow
    if (onlyOneExpectedType && noEditMode) {
      return addItem(editorSpec.defaultValue);
    }

    setEditingRow(DRAFT_ROW_KEY);
  };

  const handleSaveChanges = (index: number, value: unknown) => {
    if (isBlankStringOrNullish(value)) {
      return removeItem(index);
    }

    updateItem(index, value);
  };

  const canAddMore = isNumber(maxItems) ? items.length < maxItems : true;
  const isAddingDraft = editingRow === DRAFT_ROW_KEY;

  return (
    <GridEditorWrapper>
      <ListWrapper
        ref={listWrapperRef}
        display={items.length ? "initial" : "none"}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                onRemove={removeItem}
                onEditClicked={(id) => setEditingRow(id)}
                onSaveChanges={handleSaveChanges}
                onDiscardChanges={() => setEditingRow("")}
                editing={editingRow === item.id}
                selected={selectedRow === item.id}
                onSelect={toggleSelectedRow}
                expectedTypes={expectedTypes}
              />
            ))}
          </SortableContext>
        </DndContext>
      </ListWrapper>

      {canAddMore && !isAddingDraft && (
        <AddAnotherButton
          title={items.length ? "Add Another Value" : "Add Value"}
          onClick={handleAddAnotherClick}
        />
      )}

      {isAddingDraft && (
        <DraftRow
          existingItemCount={items.length}
          expectedTypes={expectedTypes}
          onDraftSaved={addItem}
          onDraftDiscarded={() => setEditingRow("")}
        />
      )}

      {(!canAddMore || isAddingDraft) && (
        <ItemLimitInfo min={minItems} max={maxItems} />
      )}
    </GridEditorWrapper>
  );
};
