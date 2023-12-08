import { Stack, Typography } from "@mui/material";
import { ReactNode } from "react";

import { Button } from "./button";
import { Callout } from "./callout";
import { Modal } from "./modal";

type AlertModalProps = {
  callback?: () => void;
  calloutMessage: ReactNode;
  close: () => void;
  confirmButtonText?: string;
  header: ReactNode;
  type: "info" | "warning";
};

export const AlertModal = ({
  callback,
  calloutMessage,
  close,
  confirmButtonText,
  header,
  type,
}: AlertModalProps) => {
  return (
    <Modal open onClose={close} contentStyle={{ p: { xs: 0, md: 0 } }}>
      <Stack>
        <Typography sx={{ p: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 } }}>
          {header}
        </Typography>
        <Callout type={type}>{calloutMessage}</Callout>
        <Stack direction="row" spacing={1.5} p={{ xs: 2, md: 2.5 }}>
          {callback && (
            <Button
              autoFocus
              onClick={() => {
                callback();
                close();
              }}
              size="small"
              sx={{ fontWeight: 500 }}
            >
              {confirmButtonText ?? "Continue"}
            </Button>
          )}
          <Button
            autoFocus={!callback}
            onClick={close}
            variant={callback ? "tertiary" : "primary"}
            size="small"
            sx={{ fontWeight: 500 }}
          >
            {callback ? "Cancel" : "Close"}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
};
