import type {
  ModalProps as MuiModalProps,
  SxProps,
  Theme,
} from "@mui/material";
import { Box, Modal as MuiModal } from "@mui/material";
import clsx from "clsx";
import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";

import { fluidFontClassName } from "./fluid-fonts";

export type ModalProps = MuiModalProps & {
  contentStyle?: SxProps<Theme>;
};

export const Modal: FunctionComponent<ModalProps> = ({
  open,
  children,
  onClose,
  contentStyle = [],
  ...props
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      void Promise.resolve().then(() => {
        if (!contentRef.current) {
          return;
        }
        contentRef.current.scrollTo({ behavior: "auto", top: 0 });
      });
    }
  }, [contentRef, open]);

  return (
    <MuiModal
      open={open}
      onClose={onClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
      classes={{
        ...(props.classes ?? {}),
        root: clsx(props.classes?.root, fluidFontClassName),
      }}
      {...props}
    >
      <Box
        ref={contentRef}
        sx={[
          {
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: {
              xs: "90%",
              sm: 520,
              md: "auto",
            },
            bgcolor: "white",
            boxShadow:
              "0px 20px 41px rgba(61, 78, 133, 0.07), 0px 16px 25px rgba(61, 78, 133, 0.0531481), 0px 12px 12px rgba(61, 78, 133, 0.0325), 0px 2px 3.13px rgba(61, 78, 133, 0.02)",
            borderRadius: 2,
            p: { xs: 2, md: 4 },
            maxHeight: "90vh",
            overflow: "auto",
          },
          ...(Array.isArray(contentStyle) ? contentStyle : [contentStyle]),
        ]}
      >
        {children}
      </Box>
    </MuiModal>
  );
};
