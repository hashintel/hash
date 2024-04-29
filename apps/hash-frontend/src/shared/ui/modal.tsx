import type { ModalProps } from "@hashintel/design-system";
import { Modal as BaseModal } from "@hashintel/design-system";

export const Modal = ({ sx, ...props }: ModalProps) => (
  <BaseModal
    sx={[
      ({ palette }) => ({
        p: "0px !important",
        border: 1,
        borderColor: palette.gray[20],
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);
