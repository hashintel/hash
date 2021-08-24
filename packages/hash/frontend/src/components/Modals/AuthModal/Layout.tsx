import { ReactNode, VoidFunctionComponent } from "react";
import { Dialog } from "@headlessui/react";
import { tw } from "twind";

import bgPattern from "../../../assets/images/auth-bg-pattern.png";

export type ModalProps = {
  children: ReactNode;
  close: () => void;
  show: boolean;
};

export const Layout: VoidFunctionComponent<ModalProps> = ({
  children,
  close,
  show,
}) => {
  return (
    <Dialog
      as="div"
      open={show}
      onClose={close}
      className={tw`fixed z-10 inset-0 overflow-y-auto`}
    >
      <div className={tw`fixed flex items-center inset-0 bg-white`}>
        <div className={tw`relative z-10 w-full flex justify-center`}>
          {children}
        </div>
        <div className={tw`absolute right-0 top-0 bottom-0 `}>
          <img src={bgPattern} className={tw`h-screen`} />
        </div>
        <button
          className={tw`absolute top-8 right-8 text-3xl hover:bg-black hover:bg-opacity-10 leading-none h-12 w-12 flexÏ items-center justify-center rounded-full`}
          onClick={close}
        >
          &times;
        </button>
      </div>
    </Dialog>
  );
};
