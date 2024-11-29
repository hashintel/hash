import type { ClosedDataType } from "@blockprotocol/type-system/slim";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, ButtonBase, Typography } from "@mui/material";

import { getEditorSpecs } from "./editor-specs";
import type { OnTypeChange } from "./types";
import { getEditorTypeFromExpectedType } from "./utils";

const ExpectedTypeButton = ({
  onClick,
  expectedType,
}: {
  onClick: () => void;
  expectedType: ClosedDataType;
}) => {
  const editorSpec = getEditorSpecs(
    getEditorTypeFromExpectedType(expectedType),
    expectedType,
  );

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
  expectedTypes: ClosedDataType[];
  onTypeChange: OnTypeChange;
}

export const EditorTypePicker = ({
  expectedTypes,
  onTypeChange,
}: EditorTypePickerProps) => {
  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      <Typography variant="smallCaps" mr={1}>
        Choose data type
      </Typography>
      <Typography variant="smallTextLabels">
        How are you representing this value?
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
        {expectedTypes.map((expectedType) => {
          return (
            <ExpectedTypeButton
              expectedType={expectedType}
              key={expectedType.$id}
              onClick={() =>
                onTypeChange(getEditorTypeFromExpectedType(expectedType))
              }
            />
          );
        })}
      </Box>
    </Box>
  );
};
