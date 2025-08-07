import type { VersionedUrl } from "@blockprotocol/type-system";
import { DataTypeSelector } from "@hashintel/design-system";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";
import { buildDataTypeTreesForSelector } from "@local/hash-isomorphic-utils/data-types";
import { useMemo } from "react";

import { useEntityEditor } from "../../../../entity-editor-context";
import type { OnTypeChange } from "./types";

interface EditorTypePickerProps {
  expectedTypes: ClosedDataTypeDefinition[];
  onTypeChange: OnTypeChange;
  selectedDataTypeId?: VersionedUrl;
}

export const EditorTypePicker = ({
  expectedTypes,
  onTypeChange,
  selectedDataTypeId,
}: EditorTypePickerProps) => {
  const { closedMultiEntityTypesDefinitions } = useEntityEditor();

  const dataTypeTrees = useMemo(() => {
    return buildDataTypeTreesForSelector({
      targetDataTypes: expectedTypes,
      dataTypePoolById: closedMultiEntityTypesDefinitions.dataTypes,
    });
  }, [expectedTypes, closedMultiEntityTypesDefinitions]);

  const onSelect = (dataTypeId: VersionedUrl) => {
    const selectedType =
      closedMultiEntityTypesDefinitions.dataTypes[dataTypeId];

    if (!selectedType) {
      throw new Error(`Could not find data type with id ${dataTypeId}`);
    }

    onTypeChange(selectedType.schema);
  };

  return (
    <DataTypeSelector
      dataTypes={dataTypeTrees}
      onSelect={onSelect}
      selectedDataTypeIds={selectedDataTypeId ? [selectedDataTypeId] : []}
    />
  );
};
