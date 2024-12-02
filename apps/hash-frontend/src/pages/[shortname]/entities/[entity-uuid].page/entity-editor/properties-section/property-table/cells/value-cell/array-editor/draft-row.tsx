import type { ClosedDataType } from "@blockprotocol/type-system";
import { useState } from "react";

import { DRAFT_ROW_KEY } from "../array-editor";
import { EditorTypePicker } from "../editor-type-picker";
import { isBlankStringOrNullish } from "../utils";
import { SortableRow } from "./sortable-row";

interface DraftRowProps {
  expectedTypes: ClosedDataType[];
  existingItemCount: number;
  onDraftSaved: (value: unknown) => void;
  onDraftDiscarded: () => void;
}

export const DraftRow = ({
  expectedTypes,
  existingItemCount,
  onDraftSaved,
  onDraftDiscarded,
}: DraftRowProps) => {
  const [dataType, setDataType] = useState<ClosedDataType | null>(() => {
    if (expectedTypes.length > 1) {
      return null;
    }

    if (!expectedTypes[0]) {
      throw new Error("there is no expectedType found on property type");
    }

    return expectedTypes[0];
  });

  if (!dataType) {
    return (
      <EditorTypePicker
        expectedTypes={expectedTypes}
        onTypeChange={(type) => {
          setDataType(type);
        }}
      />
    );
  }

  return (
    <SortableRow
      editing
      item={{
        dataType,
        id: DRAFT_ROW_KEY,
        index: existingItemCount,
        value: undefined,
      }}
      onSaveChanges={(_, value) => {
        if (isBlankStringOrNullish(value)) {
          return onDraftDiscarded();
        }

        onDraftSaved(value);
      }}
      onDiscardChanges={onDraftDiscarded}
      expectedTypes={expectedTypes}
    />
  );
};
