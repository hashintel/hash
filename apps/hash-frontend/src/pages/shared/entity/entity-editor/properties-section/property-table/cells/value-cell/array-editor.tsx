import type {
  PropertyArrayMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { isArrayMetadata, isValueMetadata } from "@blockprotocol/type-system";
import type { DragEndEvent } from "@dnd-kit/core";
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
import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import { Box, styled } from "@mui/material";
import { produce } from "immer";
import { isNumber } from "lodash";
import { useMemo, useRef, useState } from "react";

import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { AddAnotherButton } from "./array-editor/add-another-button";
import { DraftRow } from "./array-editor/draft-row";
import { ItemLimitInfo } from "./array-editor/item-limit-info";
import { SortableRow } from "./array-editor/sortable-row";
import type { SortableItem } from "./array-editor/types";
import { getEditorSpecs } from "./editor-specs";
import type { ValueCellEditorComponent } from "./types";
import { isBlankStringOrNullish } from "./utils";

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

  const { readonly } = cell.data;

  const {
    value: propertyValue,
    valueMetadata,
    generateNewMetadataObject,
    permittedDataTypes,
    permittedDataTypesIncludingChildren,
    propertyKeyChain,
    maxItems,
    minItems,
  } = cell.data.propertyRow;

  const items = useMemo(() => {
    const values = Array.isArray(propertyValue) ? propertyValue : [];

    if (values.length && !valueMetadata) {
      throw new Error("Expected valueMetadata to be set when there are values");
    }

    if (valueMetadata && !isArrayMetadata(valueMetadata)) {
      throw new Error(
        `Expected array metadata for value '${JSON.stringify(values)}', got ${JSON.stringify(valueMetadata)}`,
      );
    }

    const itemsArray: SortableItem[] = values.map((value, index) => {
      const arrayItemMetadata = (valueMetadata as PropertyArrayMetadata).value[
        index
      ];

      if (!arrayItemMetadata) {
        throw new Error(
          `Expected metadata for array item at index ${index} in value '${JSON.stringify(value)}'`,
        );
      }

      if (!isValueMetadata(arrayItemMetadata)) {
        throw new Error(
          `Expected single value metadata for array item at index ${index} in value '${JSON.stringify(value)}', got ${JSON.stringify(arrayItemMetadata)}`,
        );
      }

      const dataTypeId = arrayItemMetadata.metadata.dataTypeId;

      const dataType = permittedDataTypesIncludingChildren.find(
        (type) => type.schema.$id === dataTypeId,
      )?.schema;

      if (!dataType) {
        throw new Error(
          "Expected a data type to be set on the value or at least one permitted data type",
        );
      }

      return {
        dataType,
        index,
        id: `${index}_${String(value)}`,
        value,
      };
    });

    return itemsArray;
  }, [propertyValue, valueMetadata, permittedDataTypesIncludingChildren]);

  const [selectedRow, setSelectedRow] = useState("");
  const [editingRow, setEditingRow] = useState(() => {
    // if there is no item, start in add item state
    if (items.length) {
      return "";
    }

    if (
      permittedDataTypes.length === 1 &&
      !permittedDataTypes[0]!.schema.abstract
    ) {
      const expectedType = permittedDataTypes[0]!;

      const schema = getMergedDataTypeSchema(expectedType.schema);

      if ("anyOf" in schema) {
        /**
         * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
         */
        throw new Error(
          "Data types with different expected sets of constraints (anyOf) are not yet supported",
        );
      }

      if (
        getEditorSpecs(expectedType.schema, schema).arrayEditException ===
        "no-edit-mode"
      ) {
        return "";
      }
    }

    return DRAFT_ROW_KEY;
  });

  const toggleSelectedRow = (id: string) => {
    setSelectedRow((prevId) => (id === prevId ? "" : id));
  };

  const addItem = (value: unknown, dataTypeId: VersionedUrl) => {
    setEditingRow("");

    const { propertyMetadata } = generateNewMetadataObject({
      propertyKeyChain,
      valuePath: [...propertyKeyChain, items.length],
      valueMetadata: { metadata: { dataTypeId } },
    });

    const newCell = produce(cell, (draftCell) => {
      draftCell.data.propertyRow.value = [
        ...items.map((item) => item.value),
        value,
      ];

      draftCell.data.propertyRow.valueMetadata = propertyMetadata;
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
    const { propertyMetadata } = generateNewMetadataObject({
      propertyKeyChain,
      valuePath: [...propertyKeyChain, indexToRemove],
      valueMetadata: "delete",
    });

    const newCell = produce(cell, (draftCell) => {
      draftCell.data.propertyRow.value = items
        .filter((_, index) => indexToRemove !== index)
        .map(({ value }) => value);

      draftCell.data.propertyRow.valueMetadata = propertyMetadata;
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

      if (!valueMetadata) {
        throw new Error(
          "Expected valueMetadata to be set when there are values",
        );
      }

      if (!isArrayMetadata(valueMetadata)) {
        throw new Error(
          `Expected array metadata for value '${JSON.stringify(newItems)}', got ${JSON.stringify(valueMetadata)}`,
        );
      }

      const newMetadata = arrayMove(valueMetadata.value, oldIndex, newIndex);

      draftCell.data.propertyRow.valueMetadata = {
        ...valueMetadata,
        value: newMetadata,
      };
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

    const onlyOneExpectedType =
      permittedDataTypes.length === 1 &&
      !permittedDataTypes[0]!.schema.abstract;
    const expectedType = permittedDataTypes[0]!;

    const schema = getMergedDataTypeSchema(expectedType.schema);

    if ("anyOf" in schema) {
      /**
       * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
       */
      throw new Error(
        "Data types with different expected sets of constraints (anyOf) are not yet supported",
      );
    }

    const editorSpec = getEditorSpecs(expectedType.schema, schema);

    const noEditMode = editorSpec.arrayEditException === "no-edit-mode";

    // add the value on click instead of showing draftRow
    if (onlyOneExpectedType && noEditMode) {
      return addItem(editorSpec.defaultValue, expectedType.schema.$id);
    }

    setEditingRow(DRAFT_ROW_KEY);
  };

  const handleSaveChanges = (index: number, value: unknown) => {
    if (isBlankStringOrNullish(value)) {
      return removeItem(index);
    }

    updateItem(index, value);
  };

  const canAddMore =
    !readonly && (isNumber(maxItems) ? items.length < maxItems : true);
  const isAddingDraft = editingRow === DRAFT_ROW_KEY;

  const hasConstraints = minItems !== undefined || maxItems !== undefined;

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
            {items.map((item, index) => (
              <SortableRow
                key={item.id}
                isLastRow={index === items.length - 1}
                item={item}
                onRemove={removeItem}
                onEditClicked={(id) => setEditingRow(id)}
                onSaveChanges={handleSaveChanges}
                onDiscardChanges={() => setEditingRow("")}
                editing={editingRow === item.id}
                selected={selectedRow === item.id}
                onSelect={toggleSelectedRow}
                expectedTypes={permittedDataTypes}
                readonly={readonly}
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
          arrayConstraints={hasConstraints ? { minItems, maxItems } : undefined}
          existingItemCount={items.length}
          expectedTypes={permittedDataTypes}
          onDraftSaved={addItem}
          onDraftDiscarded={() => setEditingRow("")}
        />
      )}

      {!canAddMore && !readonly && hasConstraints && (
        <ItemLimitInfo min={minItems} max={maxItems} />
      )}
    </GridEditorWrapper>
  );
};
