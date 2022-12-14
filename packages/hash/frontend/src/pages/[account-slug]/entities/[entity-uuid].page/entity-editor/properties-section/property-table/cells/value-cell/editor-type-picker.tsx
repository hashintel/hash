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
}: /** @todo maybe don't show the current type, or show the current type as already selected? */

EditorTypePickerProps) => {
  return (
    <Box
      sx={{
        background: "white",
        px: 2,
        py: 1.5,
        border: "1px solid",
        borderColor: "gray.30",
        /**
         * @todo consider removing the border style from here, but provide it via a wrapper,
         * because it looks weird to have this border inside another border
         * (this happens when we're adding new values to an array with existing values)
         * */
        borderRadius: 1,
      }}
    >
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
