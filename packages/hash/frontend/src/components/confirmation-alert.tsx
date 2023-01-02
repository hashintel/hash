import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { Button } from "../shared/ui";

type ConfirmationAlertProps = {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  title: string;
};

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
        onClose={onClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            {children}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={onContinue} autoFocus>
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
