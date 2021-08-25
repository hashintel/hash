import { useState, VFC } from "react";

import { SignupIntro } from "./SignupIntro";
import { VerifyCode } from "./VerifyCode";
import { AccountSetup } from "./AccountSetup";

import { Layout } from "./Layout";
import { useMutation } from "@apollo/client";
import {
  CreateUserMutation,
  CreateUserMutationVariables,
  VerificationCodeMetadata,
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  createUser as createUserMutation,
  verifyEmail as verifyEmailMutation,
} from "../../../graphql/queries/user.queries";

type SignupModalProps = {
  show: boolean;
  close: () => void;
  onSignupComplete: () => void;
};

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

export const SignupModal: VFC<SignupModalProps> = ({
  show,
  close,
  onSignupComplete,
}) => {
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.Intro);
  const [email, setEmail] = useState("");
  const [verificationCodeMetadata, setVerificationCodeMetadata] = useState<
    VerificationCodeMetadata | undefined
  >();
  const [verificationCode, setVerificationCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [createUser, { loading: createUserLoading }] = useMutation<
    CreateUserMutation,
    CreateUserMutationVariables
  >(createUserMutation, {
    onCompleted: ({ createUser }) => {
      setErrorMessage("");
      setVerificationCodeMetadata(createUser);
      setActiveScreen(Screen.VerifyCode);
    },
    onError: () => {},
  });

  const [verifyEmail, { loading: verifyEmailLoading }] = useMutation<
    VerifyEmailMutation,
    VerifyEmailMutationVariables
  >(verifyEmailMutation, {
    onCompleted: ({}) => {
      setErrorMessage("");
      onSignupComplete?.();
    },
    onError: () => {},
  });

  const requestVerificationCode = (email: string) => {
    setEmail(email);
    createUser({
      variables: { email },
    });
  };

  const handleVerifyEmail = () => {
    if (!verificationCodeMetadata) return;
    verifyEmail({
      variables: {
        verificationId: verificationCodeMetadata?.id,
        verificationCode: verificationCode,
      },
    });
  };

  const renderContent = () => {
    switch (activeScreen) {
      case Screen.VerifyCode:
        return (
          <VerifyCode
            loginIdentifier={email}
            goBack={goBack}
            code={verificationCode}
            setCode={setVerificationCode}
            loading={verifyEmailLoading}
            handleSubmit={handleVerifyEmail}
          />
        );

      case Screen.AccountSetup:
        return <AccountSetup />;

      case Screen.Intro:
      default:
        return (
          <SignupIntro
            loading={createUserLoading}
            errorMessage={errorMessage}
            handleSubmit={requestVerificationCode}
          />
        );
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
