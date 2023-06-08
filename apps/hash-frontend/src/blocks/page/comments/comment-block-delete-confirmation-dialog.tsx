import { Button } from "@hashintel/design-system";
import {
  alpha,
  backdropClasses,
  Box,
  Dialog,
  dialogClasses,
  DialogContent,
  DialogContentText,
} from "@mui/material";
import { FunctionComponent } from "react";

type CommentBlockDeleteConfirmationDialogProps = {
  container: HTMLDivElement | null;
  open: boolean;
  loading: boolean;
  onDelete: () => Promise<void>;
  onCancel: () => void;
};

export const CommentBlockDeleteConfirmationDialog: FunctionComponent<
  CommentBlockDeleteConfirmationDialogProps
> = ({ container, open, loading, onDelete, onCancel }) => (
  <Dialog
    open={open}
    fullWidth
    container={container}
    sx={{
      [`&.${dialogClasses.root}`]: {
        position: "absolute",
      },
      [`.${dialogClasses.paper}`]: {
        overflow: "visible",
        maxHeight: "calc(100% - 32px)",
        maxWidth: 192,
        p: 1.5,
      },
    }}
    BackdropProps={{
      sx: {
        [`&.${backdropClasses.root}`]: {
          position: "absolute",
          backgroundColor: ({ palette }) => alpha(palette.red[40], 0.4),
        },
      },
    }}
  >
    <DialogContent
      sx={{
        overflow: "visible",
        p: 0,
        pb: 1.25,
      }}
    >
      <DialogContentText variant="microText" align="center">
        Are you sure you want to delete this comment?
      </DialogContentText>
    </DialogContent>

    <Box sx={{ display: "flex", justifyContent: "center", gap: 0.75 }}>
      <Button
        size="xs"
        onClick={onDelete}
        variant="danger"
        loading={loading}
        loadingWithoutText
        sx={{ width: 75, height: 35 }}
      >
        Delete
      </Button>
      <Button
        size="xs"
        onClick={onCancel}
        variant="tertiary"
        autoFocus
        sx={{ width: 75, height: 35 }}
      >
        Cancel
      </Button>
    </Box>
  </Dialog>
);
