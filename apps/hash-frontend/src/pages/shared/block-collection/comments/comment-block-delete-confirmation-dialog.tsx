import type { FunctionComponent } from "react";
import {
  alpha,
  backdropClasses,
  Box,
  Dialog,
  dialogClasses,
  DialogContent,
  DialogContentText,
} from "@mui/material";

import { Button } from "../../../../shared/ui";

interface CommentBlockDeleteConfirmationDialogProps {
  container: HTMLDivElement | null;
  open: boolean;
  loading: boolean;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}

export const CommentBlockDeleteConfirmationDialog: FunctionComponent<
  CommentBlockDeleteConfirmationDialogProps
> = ({ container, open, loading, onDelete, onCancel }) => (
  <Dialog
    fullWidth
    open={open}
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
      <DialogContentText variant={"microText"} align={"center"}>
        Are you sure you want to delete this comment?
      </DialogContentText>
    </DialogContent>

    <Box sx={{ display: "flex", justifyContent: "center", gap: 0.75 }}>
      <Button
        loadingWithoutText
        size={"xs"}
        variant={"danger"}
        loading={loading}
        sx={{ width: 75, height: 35 }}
        onClick={onDelete}
      >
        Delete
      </Button>
      <Button
        autoFocus
        size={"xs"}
        variant={"tertiary"}
        sx={{ width: 75, height: 35 }}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </Box>
  </Dialog>
);
