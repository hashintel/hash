import React, { useCallback, VoidFunctionComponent } from "react";
import { useRouter } from "next/router";
import { ParsedUrlQueryInput } from "querystring";
import { useEffect, useState } from "react";

import { ModalProps } from "../Modal";
import { useLogin } from "../../hooks/useLogin";
import { Layout } from "./Layout";
import { LoginIntro } from "./LoginIntro";
import { VerifyCode } from "./VerifyCode";

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

type ParsedLoginQuery = {
  verificationId: string;
  verificationCode: string;
};

const tbdIsParsedLoginQuery = (
  tbd: ParsedUrlQueryInput
): tbd is ParsedLoginQuery =>
  typeof tbd.loginId === "string" && typeof tbd.loginCode === "string";

type LoginModalProps = {
  onLoggedIn?: () => void;
} & Omit<ModalProps, "children">;

export const LoginModal: VoidFunctionComponent<LoginModalProps> = ({
  show,
  close,
  onLoggedIn,
}) => {
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.Intro);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const router = useRouter();

  const resetForm = useCallback(() => {
    // setActiveScreen(Screen.Intro);
    // setLoginCode("");
  }, []);

  const {
    verificationCodeMetadata,
    loginWithLoginCode,
    loginWithLoginCodeLoading,
    sendLoginCode,
    sendLoginCodeLoading,
    errorMessage,
  } = useLogin({
    reset: resetForm,
    onLoggedIn,
    onIncorrectLoginCode: () => {},
  });

  // handle magic link
  useEffect(() => {
    const { pathname, query } = router;
    if (pathname === "/login" && tbdIsParsedLoginQuery(query)) {
      const { verificationId, verificationCode } = query;
      setActiveScreen(Screen.VerifyCode);
      setTimeout(() => {
        void loginWithLoginCode({
          variables: { verificationId, verificationCode },
        });
      }, 1000);
    }
  }, [router, loginWithLoginCode]);

  const requestLoginCode = (emailOrShortname: string) => {
    let identifier;
    if (emailOrShortname.includes("@")) {
      identifier = emailOrShortname;
    } else {
      identifier = `@${emailOrShortname}`;
    }
    setLoginIdentifier(identifier);
    sendLoginCode({ variables: { emailOrShortname } })
      .then(() => {
        setActiveScreen(Screen.VerifyCode);
      })
      .catch((err) => {});
  };

  const login = () => {
    if (!verificationCodeMetadata) return;
    void loginWithLoginCode({
      variables: {
        verificationId: verificationCodeMetadata.id,
        verificationCode,
      },
    });
  };

  const goBack = () => {
    if (activeScreen == Screen.VerifyCode) {
      setActiveScreen(Screen.Intro);
    }
  };

  const renderContent = () => {
    switch (activeScreen) {
      case Screen.VerifyCode:
        return (
          <VerifyCode
            loginIdentifier={loginIdentifier}
            loginCode={verificationCode}
            setLoginCode={setVerificationCode}
            goBack={goBack}
            handleSubmit={login}
            loading={loginWithLoginCodeLoading}
            errorMessage={errorMessage}
          />
        );
      case Screen.Intro:
      default:
        return (
          <LoginIntro
            requestLoginCode={requestLoginCode}
            loading={sendLoginCodeLoading}
            errorMessage={errorMessage}
          />
        );
    }
  };

  return (
    <Layout show={show} close={close}>
      {renderContent()}
    </Layout>
  );
};
