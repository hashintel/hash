import { useState, VFC } from "react";

import { Intro } from "./SignupIntro";
import { VerifyCode } from "./VerifyCode";
import { AccountSetup } from "./AccountSetup";

import { Layout } from "./Layout";

type SignupModalProps = {
  show: boolean;
  close: () => void;
};

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

export const SignupModal: VFC<SignupModalProps> = ({ show, close }) => {
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.Intro);
  // const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginCode, setLoginCode] = useState("");

  const renderContent = () => {
    switch (activeScreen) {
      case Screen.VerifyCode:
        return (
          <VerifyCode
            loginIdentifier=""
            goBack={goBack}
            loginCode={loginCode}
            setLoginCode={setLoginCode}
            loading={false}
          />
        );

      case Screen.AccountSetup:
        return <AccountSetup />;

      case Screen.Intro:
      default:
        return <Intro navigateForward={navigateForward} />;
    }
  };

  const navigateForward = () => {
    let newScreen;

    if (activeScreen === Screen.AccountSetup) {
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
    if (activeScreen === Screen.VerifyCode) {
      setActiveScreen(Screen.Intro);
    }
  };

  return (
    <Layout show={show} close={close}>
      {renderContent()}
    </Layout>
  );
};
