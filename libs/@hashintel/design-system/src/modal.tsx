import {
  Box,
  Modal as MuiModal,
  ModalProps as MuiModalProps,
  SxProps,
  Theme,
} from "@mui/material";
import clsx from "clsx";
import { FunctionComponent } from "react";

import { fluidFontClassName } from "./fluid-fonts";

const style: SxProps<Theme> = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: {
    xs: "90%",
    sm: 520,
  },
  bgcolor: "white",
  boxShadow:
    "0px 20px 41px rgba(61, 78, 133, 0.07), 0px 16px 25px rgba(61, 78, 133, 0.0531481), 0px 12px 12px rgba(61, 78, 133, 0.0325), 0px 2px 3.13px rgba(61, 78, 133, 0.02)",
  borderRadius: 2,
  p: { xs: 2, md: 4 },
};

type ModalProps = MuiModalProps & {
  contentStyle?: SxProps<Theme>;
};

export const Modal: FunctionComponent<ModalProps> = ({
  open,
  children,
  onClose,
  contentStyle = [],
  ...props
}) => {
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
        sx={[
          style,
          ...(Array.isArray(contentStyle) ? contentStyle : [contentStyle]),
        ]}
      >
        {children}
      </Box>
    </MuiModal>
  );
};
