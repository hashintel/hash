import type { FunctionComponent, ReactNode } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

import { Button } from "../shared/ui";

interface ConfirmationAlertProps {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  title: string;
}

export const ConfirmationAlert: FunctionComponent<ConfirmationAlertProps> = ({
  children,
  open,
  onClose,
  onContinue,
  title,
}) => {
  return (
    <div>
      <Dialog
        open={open}
        aria-labelledby={"alert-dialog-title"}
        aria-describedby={"alert-dialog-description"}
        onClose={onClose}
      >
        <DialogTitle id={"alert-dialog-title"}>{title}</DialogTitle>
        <DialogContent>
          <DialogContentText id={"alert-dialog-description"}>
            {children}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button autoFocus onClick={onContinue}>
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
