import { useState } from "react";
import { PropertyRow } from "../../../types";
import { DRAFT_ROW_KEY } from "../array-editor";
import { EditorTypePicker } from "../editor-type-picker";
import { EditorType } from "../types";
import { guessEditorTypeFromExpectedType } from "../utils";
import { SortableRow } from "./sortable-row";

interface DraftRowProps {
  propertyRow: PropertyRow;
  onDraftSaved: (value: unknown) => void;
  onDraftDiscarded: () => void;
}

export const DraftRow = ({
  propertyRow,
  onDraftSaved,
  onDraftDiscarded,
}: DraftRowProps) => {
  const { expectedTypes } = propertyRow;

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
        onTypeChange={setEditorType}
      />
    );
  }

  return (
    <SortableRow
      editing
      item={{
        id: DRAFT_ROW_KEY,
        index: 0,
        value: null,
        overriddenEditorType: editorType,
      }}
      onSaveChanges={(_, value) => onDraftSaved(value)}
      onDiscardChanges={onDraftDiscarded}
      expectedTypes={expectedTypes}
    />
  );
};
