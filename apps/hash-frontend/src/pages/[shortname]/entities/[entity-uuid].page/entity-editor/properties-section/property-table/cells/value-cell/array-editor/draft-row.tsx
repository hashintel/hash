import type { DataTypeWithMetadata } from "@local/hash-graph-types/ontology";
import { useState } from "react";

import { DRAFT_ROW_KEY } from "../array-editor";
import { getEditorSpecs } from "../editor-specs";
import { EditorTypePicker } from "../editor-type-picker";
import type { EditorType } from "../types";
import {
  guessEditorTypeFromExpectedType,
  isBlankStringOrNullish,
} from "../utils";
import { SortableRow } from "./sortable-row";

interface DraftRowProps {
  expectedTypes: DataTypeWithMetadata["schema"][];
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
  const [editorType, setEditorType] = useState<EditorType | null>(() => {
    if (expectedTypes.length > 1) {
      return null;
    }

    if (!expectedTypes[0]) {
      throw new Error("there is no expectedType found on property type");
    }

    return guessEditorTypeFromExpectedType(expectedTypes[0]);
  });

  if (!editorType) {
    return (
      <EditorTypePicker
        expectedTypes={expectedTypes}
        onTypeChange={(type) => {
          const editorSpec = getEditorSpecs(type);

          if (editorSpec.arrayEditException === "no-edit-mode") {
            onDraftSaved(editorSpec.defaultValue);
          }

          setEditorType(type);
        }}
      />
    );
  }

  return (
    <SortableRow
      editing
      item={{
        id: DRAFT_ROW_KEY,
        index: existingItemCount,
        value: undefined,
        overriddenEditorType: editorType,
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
