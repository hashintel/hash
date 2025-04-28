import type { ClosedDataType, VersionedUrl } from "@blockprotocol/type-system";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";
import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import { useState } from "react";

import { DRAFT_ROW_KEY } from "../array-editor";
import { getEditorSpecs } from "../editor-specs";
import { EditorTypePicker } from "../editor-type-picker";
import { isBlankStringOrNullish } from "../utils";
import { ItemLimitInfo } from "./item-limit-info";
import { SortableRow } from "./sortable-row";

interface DraftRowProps {
  arrayConstraints?: {
    minItems?: number;
    maxItems?: number;
  };
  expectedTypes: ClosedDataTypeDefinition[];
  existingItemCount: number;
  onDraftSaved: (value: unknown, dataTypeId: VersionedUrl) => void;
  onDraftDiscarded: () => void;
}

export const DraftRow = ({
  arrayConstraints,
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

    return expectedTypes[0].schema;
  });

  if (!dataType || dataType.abstract) {
    return (
      <EditorTypePicker
        expectedTypes={expectedTypes}
        onTypeChange={(type) => {
          const schema = getMergedDataTypeSchema(type);

          if ("anyOf" in schema) {
            throw new Error("Expected a single data type, but got multiple");
          }

          const editorSpec = getEditorSpecs(type, schema);

          if (editorSpec.arrayEditException === "no-edit-mode") {
            onDraftSaved(editorSpec.defaultValue, type.$id);
          }

          setDataType(type);
        }}
      />
    );
  }

  return (
    <>
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

          onDraftSaved(value, dataType.$id);
        }}
        onDiscardChanges={onDraftDiscarded}
        expectedTypes={expectedTypes}
        readonly={false}
        isLastRow
      />
      {arrayConstraints && (
        <ItemLimitInfo
          min={arrayConstraints.minItems}
          max={arrayConstraints.maxItems}
        />
      )}
    </>
  );
};
