import type {
  ClosedDataType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import {
  buildDataTypeTreesForSelector,
  DataTypeSelector,
  FontAwesomeIcon,
} from "@hashintel/design-system";
import { ClosedDataTypeDefinition } from "@local/hash-graph-types/ontology";
import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import { Box, ButtonBase, Typography } from "@mui/material";
import { useMemo } from "react";

import { useEntityEditor } from "../../../../entity-editor-context";
import { getEditorSpecs } from "./editor-specs";
import type { OnTypeChange } from "./types";

const ExpectedTypeButton = ({
  onClick,
  expectedType,
}: {
  onClick: () => void;
  expectedType: ClosedDataType;
}) => {
  const schema = getMergedDataTypeSchema(expectedType);

  if ("anyOf" in schema) {
    throw new Error(
      "Data types with different expected sets of constraints (anyOf) are not yet supported",
    );
  }

  const editorSpec = getEditorSpecs(expectedType, schema);

  const { description, title } = expectedType;

  return (
    <ButtonBase
      onClick={onClick}
      disableRipple
      disableTouchRipple
      sx={{
        border: "1px solid",
        borderColor: "gray.30",
        borderRadius: 1,
        minHeight: 42,
        justifyContent: "flex-start",
        px: 2.5,
        py: 1.5,
        gap: 1.5,
        "&:hover": {
          backgroundColor: "gray.10",
        },
      }}
    >
      <FontAwesomeIcon icon={{ icon: editorSpec.icon }} />
      <Typography variant="smallTextLabels">{title}</Typography>
      {!!description && (
        <Typography variant="microText" color="gray.50" textAlign="start">
          {description}
        </Typography>
      )}
    </ButtonBase>
  );
};

interface EditorTypePickerProps {
  expectedTypes: ClosedDataTypeDefinition[];
  onTypeChange: OnTypeChange;
}

export const EditorTypePicker = ({
  expectedTypes,
  onTypeChange,
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

  return <DataTypeSelector dataTypes={dataTypeTrees} onSelect={onSelect} />;
};
