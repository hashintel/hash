import { Dialog } from "@headlessui/react";
import { ReactNode, VFC } from "react";
import { tw } from "twind";
import { AuthLayout } from "./auth-layout";

export type AuthModalLayoutProps = {
  onClose?: () => void;
  show: boolean;
  loading?: boolean;
  children: ReactNode;
};

export const AuthModalLayout: VFC<AuthModalLayoutProps> = ({
  onClose,
  show,
  children,
  loading,
}) => (
  <Dialog
    as="div"
    open={show}
    onClose={onClose ?? (() => {})}
    className={tw`fixed z-10 inset-0 overflow-y-auto`}
  >
    <AuthLayout onClose={onClose} loading={loading}>
      {children}
    </AuthLayout>
  </Dialog>
);
