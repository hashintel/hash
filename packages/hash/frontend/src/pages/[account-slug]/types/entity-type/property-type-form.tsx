import { Button, ButtonProps } from "@hashintel/hash-design-system/button";
import { TextField } from "@hashintel/hash-design-system/text-field";
import { Box, Divider, inputLabelClasses, Stack } from "@mui/material";
import { QuestionIcon } from "./question-icon";

export const PropertyTypeForm = ({
  createButtonProps,
  discardButtonProps,
  initialTitle,
}: {
  createButtonProps: Omit<ButtonProps, "size" | "variant" | "children">;
  discardButtonProps: Omit<ButtonProps, "size" | "variant" | "children">;
  initialTitle?: string;
}) => (
  <Box minWidth={500} p={3}>
    <Stack
      alignItems="stretch"
      spacing={3}
      sx={(theme) => ({
        [`.${inputLabelClasses.root}`]: {
          display: "flex",
          alignItems: "center",
        },
        [`.${inputLabelClasses.asterisk}`]: {
          color: theme.palette.blue[70],
        },
      })}
    >
      <TextField
        label="Singular name"
        required
        placeholder="e.g. Stock Price"
        defaultValue={initialTitle}
      />
      <TextField
        multiline
        inputProps={{ minRows: 1 }}
        label={
          <>
            Description <QuestionIcon sx={{ order: 1, ml: 0.75 }} />
          </>
        }
        required
        placeholder="Describe this property type in one or two sentences"
      />
      <TextField
        label="Expected values"
        sx={{ alignSelf: "flex-start", width: "70%" }}
        required
        placeholder="Select acceptable values"
      />
    </Stack>
    <Divider sx={{ mt: 2, mb: 3 }} />
    <Stack direction="row" spacing={1.25}>
      <Button {...createButtonProps} size="small">
        Create new property type
      </Button>
      <Button {...discardButtonProps} size="small" variant="tertiary">
        Discard draft
      </Button>
    </Stack>
  </Box>
);
