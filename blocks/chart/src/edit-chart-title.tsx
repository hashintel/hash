import type { BoxProps } from "@mui/material";
import { Box, styled, TextField } from "@mui/material";
import debounce from "lodash.debounce";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";

const StyledTextField = styled(TextField)(({ theme }) => ({
  "> .MuiInputBase-root > input": {
    padding: theme.spacing(1),
  },
  "> .MuiInputLabel-root.MuiInputLabel-formControl.MuiInputLabel-animated": {
    top: -8,
    "&.MuiInputLabel-shrink": {
      top: 0,
    },
  },
}));

type EditableChartTitleProps = {
  title: string;
  updateTitle: (updatedTitle: string) => Promise<void>;
  sx?: BoxProps["sx"];
};

export const EditableChartTitle: FunctionComponent<EditableChartTitleProps> = ({
  title: initialTitle,
  updateTitle,
  sx = [],
}) => {
  const [textFieldValue, setTextFieldValue] = useState<string>(initialTitle);

  const debouncedUpdateTitle = useMemo(
    () =>
      debounce(async (updatedTitle: string) => updateTitle(updatedTitle), 500),
    [updateTitle],
  );

  return (
    <Box
      sx={[
        {
          display: "flex",
          justifyContent: "center",
          width: "100%",
          marginTop: 1,
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO why is this inferred as any?
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <StyledTextField
        value={textFieldValue}
        onChange={({ target }) => {
          const { value: updatedTitle } = target;

          setTextFieldValue(updatedTitle);
          void debouncedUpdateTitle(updatedTitle);
        }}
        sx={{
          /** @todo: set the width of the input depending on the text width */
          width: 250,
          ".MuiOutlinedInput-notchedOutline": {
            borderColor: "transparent",
          },
        }}
        inputProps={{
          sx: {
            textAlign: "center",
            fontSize: 24,
            padding: 1,
          },
        }}
      />
    </Box>
  );
};
