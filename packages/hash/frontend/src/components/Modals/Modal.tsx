import { ReactNode, VoidFunctionComponent } from "react";
import { Dialog } from "@headlessui/react";
import { tw } from "twind";

export type ModalProps = {
  children: ReactNode;
  close: () => void;
  show: boolean;
};

export const Modal: VoidFunctionComponent<ModalProps> = ({
  children,
  close,
  show,
}) => {
  return (
    <Dialog
      className={tw`fixed z-10 inset-0 overflow-y-auto flex h-screen justify-center items-center`}
      open={show}
      onClose={close}
    >
      <Dialog.Overlay className={tw`fixed inset-0 bg-black opacity-80`} />
      <div
        className={tw`inline-block w-full max-w-lg p-12 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-xl`}
      >
        {children}
      </div>
    </Dialog>
  );
};
