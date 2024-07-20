import type { FunctionComponent } from "react";
import type { Box,SxProps, Theme  } from "@mui/material";

import { Button } from "../../../../shared/ui";

interface CommentActionButtonsProps {
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  sx?: SxProps<Theme>;
}

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
      <Button size={"xs"} variant={"tertiary"} onClick={onCancel}>
        {cancelLabel}
      </Button>

      <Button
        size={"xs"}
        variant={"secondary"}
        disabled={submitDisabled}
        loading={loading}
        loadingText={loadingText}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </Box>
  );
};
