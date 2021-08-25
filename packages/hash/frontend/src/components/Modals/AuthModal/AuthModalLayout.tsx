import { ReactNode, VoidFunctionComponent } from "react";
import { Dialog } from "@headlessui/react";
import { tw } from "twind";
import { AuthLayout } from "../../layout/PageLayout/AuthLayout";

export type AuthModalLayoutProps = {
  children: ReactNode;
  close: () => void;
  show: boolean;
  closeIconHidden?: boolean;
};

export const AuthModalLayout: VoidFunctionComponent<AuthModalLayoutProps> = ({
  children,
  close,
  show,
  closeIconHidden = false,
}) => (
  <Dialog
    as="div"
    open={show}
    onClose={close}
    className={tw`fixed z-10 inset-0 overflow-y-auto`}
  >
    <AuthLayout onClose={close} closeIconHidden={closeIconHidden}>
      {children}
    </AuthLayout>
  </Dialog>
);
