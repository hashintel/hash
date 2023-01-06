import { Dialog } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { AuthLayout } from "./auth-layout";

export type AuthModalLayoutProps = {
  onClose?: () => void;
  show: boolean;
  loading?: boolean;
  children: ReactNode;
};

export const AuthModalLayout: FunctionComponent<AuthModalLayoutProps> = ({
  onClose,
  show,
  children,
  loading,
}) => (
  <Dialog
    open={show}
    onClose={onClose ?? (() => {})}
    style={{
      bottom: "0",
      left: "0",
      overflowY: "auto",
      position: "fixed",
      right: "0",
      top: "0",
      zIndex: "10",
    }}
  >
    <AuthLayout onClose={onClose} loading={loading}>
      {children}
    </AuthLayout>
  </Dialog>
);
