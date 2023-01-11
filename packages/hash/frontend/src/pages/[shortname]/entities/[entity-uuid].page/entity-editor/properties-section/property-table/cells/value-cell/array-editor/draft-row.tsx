import { useState } from "react";

import { DRAFT_ROW_KEY } from "../array-editor";
import { EditorTypePicker } from "../editor-type-picker";
import { EditorType } from "../types";
import {
  guessEditorTypeFromExpectedType,
  isBlankStringOrNullish,
} from "../utils";
import { SortableRow } from "./sortable-row";

interface DraftRowProps {
  expectedTypes: string[];
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
          // for boolean type, we don't need the "save changes" flow, so we directly create a "true" value here
          if (type === "boolean") {
            onDraftSaved(true);
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
        value: null,
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
