import { Button } from "@local/hash-design-system";
import { Box, SxProps, Theme } from "@mui/material";
import { FunctionComponent } from "react";

type CommentActionButtonsProps = {
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  sx?: SxProps<Theme>;
};

export const CommentActionButtons: FunctionComponent<
  CommentActionButtonsProps
> = ({
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  submitDisabled,
  loading,
  loadingText,
  onSubmit,
  onCancel,
  sx,
}) => {
  return (
    <Box
      sx={[
        {
          display: "flex",
          gap: 0.75,
          justifyContent: "flex-end",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Button size="xs" variant="tertiary" onClick={onCancel}>
        {cancelLabel}
      </Button>

      <Button
        size="xs"
        variant="secondary"
        onClick={onSubmit}
        disabled={submitDisabled}
        loading={loading}
        loadingText={loadingText}
      >
        {submitLabel}
      </Button>
    </Box>
  );
};
