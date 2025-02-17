import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent, PropsWithChildren, ReactNode } from "react";

import { Button } from "./button";
import { Callout } from "./callout";
import { Modal } from "./modal";

type AlertModalProps = {
  callback?: () => void;
  calloutMessage: ReactNode;
  close: () => void;
  confirmButtonText?: string;
  header?: ReactNode;
  open?: boolean;
  processing?: boolean;
  type: "info" | "warning" | "error";
  contentStyle?: SxProps<Theme>;
};

export const AlertModal: FunctionComponent<
  AlertModalProps & PropsWithChildren
> = ({
  callback,
  calloutMessage,
  close,
  confirmButtonText,
  header,
  open = true,
  processing,
  type,
  children,
  contentStyle,
}) => {
  return (
    <Modal
      open={open}
      onClose={close}
      contentStyle={[
        { p: { xs: 0, md: 0 }, maxHeight: "min(600px, 90vh)" },
        ...(Array.isArray(contentStyle) ? contentStyle : [contentStyle]),
      ]}
    >
      <Stack>
        <Typography
          component="div"
          sx={{ p: { xs: 2, md: 2.5 }, py: { xs: 1.5, md: 2 } }}
        >
          {header}
        </Typography>
        <Callout type={type}>{calloutMessage}</Callout>
        {children ? <Box p={{ xs: 2, md: 2.5 }}>{children}</Box> : null}
        <Stack
          direction="row"
          spacing={1.5}
          p={{ xs: 2, md: 2.5 }}
          pt={{ xs: children ? 0 : 2, md: children ? 0 : 2.5 }}
        >
          {callback && (
            <Button
              autoFocus
              disabled={processing}
              loading={processing}
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
            disabled={processing}
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
