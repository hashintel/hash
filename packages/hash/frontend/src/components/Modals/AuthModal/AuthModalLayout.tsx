import { FC } from "react";
import { Dialog } from "@headlessui/react";
import { tw } from "twind";
import { AuthLayout } from "../../layout/PageLayout/AuthLayout";

export type AuthModalLayoutProps = {
  onClose?: () => void;
  show: boolean;
};

export const AuthModalLayout: FC<AuthModalLayoutProps> = ({
  onClose = () => {},
  show,
  children,
}) => (
  <Dialog
    as="div"
    open={show}
    onClose={onClose}
    className={tw`fixed z-10 inset-0 overflow-y-auto`}
  >
    <AuthLayout onClose={onClose}>{children}</AuthLayout>
  </Dialog>
);
