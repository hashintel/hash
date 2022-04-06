import { FC } from "react";
import { Dialog } from "@headlessui/react";
import { tw } from "twind";
import { AuthLayout } from "../../shared/layout";

export type AuthModalLayoutProps = {
  onClose?: () => void;
  show: boolean;
  loading?: boolean;
};

export const AuthModalLayout: FC<AuthModalLayoutProps> = ({
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
