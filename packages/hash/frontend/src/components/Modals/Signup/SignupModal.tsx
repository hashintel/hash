import { useState, VFC } from "react";
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

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

export const SignupModal: VFC<SignupModalProps> = ({ show }) => {
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.Intro);

  const renderContent = () => {
    switch (activeScreen) {
      case Screen.VerifyCode:
        return <VerifyCode goBack={goBack} navigateForward={navigateForward} />;

      case Screen.AccountSetup:
        return <AccountSetup navigateForward={navigateForward} />;

      case Screen.Intro:
      default:
        return <Intro navigateForward={navigateForward} />;
    }
  };

  const navigateForward = () => {
    let newScreen;

    if (activeScreen == Screen.AccountSetup) {
      return;
    }

    switch (activeScreen) {
      case Screen.Intro:
        newScreen = Screen.VerifyCode;
        break;

      case Screen.VerifyCode:
        newScreen = Screen.AccountSetup;
        break;

      default:
        return;
    }

    setActiveScreen(newScreen);
  };

  const goBack = () => {
    if (activeScreen == Screen.VerifyCode) {
      setActiveScreen(Screen.Intro);
    }
  };

  return (
    <Dialog
      as="div"
      open={show}
      onClose={() => {}}
      className={tw`fixed z-10 inset-0 overflow-y-auto`}
    >
      <div className={tw`fixed flex items-center inset-0 bg-white`}>
        <div className={tw`relative z-10 w-full flex justify-center`}>
          {renderContent()}
        </div>
        <div className={tw`absolute right-0 top-0 bottom-0 `}>
          <BgPattern className={tw`h-screen`} />
        </div>
      </div>
    </Dialog>
  );
};
