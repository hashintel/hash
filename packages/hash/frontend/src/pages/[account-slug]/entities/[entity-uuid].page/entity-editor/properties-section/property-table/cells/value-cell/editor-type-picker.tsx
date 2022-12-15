import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, ButtonBase, Typography } from "@mui/material";
import { OnTypeChange } from "./types";
import { guessEditorTypeFromExpectedType } from "./utils";

interface EditorTypePickerProps {
  expectedTypes: string[];
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
        {expectedTypes.map((expectedType) => (
          <ButtonBase
            key={expectedType}
            onClick={() =>
              onTypeChange(guessEditorTypeFromExpectedType(expectedType))
            }
            disableRipple
            disableTouchRipple
            sx={{
              border: "1px solid",
              borderColor: "gray.30",
              borderRadius: 1,
              height: 42,
              justifyContent: "flex-start",
              px: 2.5,
              gap: 1,

              "&:hover": {
                backgroundColor: "gray.10",
              },
            }}
          >
            <FontAwesomeIcon icon={faAsterisk} />
            <Typography variant="smallTextLabels">{expectedType}</Typography>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
};
