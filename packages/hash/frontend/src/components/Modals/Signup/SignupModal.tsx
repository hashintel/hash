import { VFC } from "react";
import { tw } from "twind";

import { Dialog } from "@headlessui/react";
import BgPattern from "../../../assets/svg/auth-bg-pattern.svg";

import logo from "../../../assets/images/logo.png";
import { Intro } from "./Intro";
import { VerifyCode } from "./VerifyCode";
import { AccountSetup } from "./AccountSetup";

type SignupModalProps = {
  show: boolean;
};

export const SignupModal: VFC<SignupModalProps> = ({ show }) => {
  return (
    <Dialog
      as="div"
      open={show}
      onClose={() => {}}
      className={tw`fixed z-10 inset-0 overflow-y-auto`}
    >
      <div className={tw`fixed flex items-center inset-0 bg-white`}>
        <div className={tw`relative z-10 w-full flex justify-center`}>
          {/* <Intro /> */}
          {/* <VerifyCode /> */}
          <AccountSetup />
        </div>
        <div className={tw`absolute right-0 top-0 bottom-0 `}>
          <BgPattern className={tw`h-screen`} />
        </div>
      </div>
    </Dialog>
  );
};
