import { useState, VFC } from "react";

import { SignupIntro } from "./SignupIntro";
import { VerifyCode } from "./VerifyCode";
import { AccountSetup } from "./AccountSetup";

import { AuthModalLayout, AuthModalLayoutProps } from "./AuthModalLayout";
import { ApolloError, useMutation } from "@apollo/client";
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
  onSignupComplete: () => void;
} & Omit<AuthModalLayoutProps, "children">;

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

export const SignupModal: VFC<SignupModalProps> = ({
  show,
  close,
  onSignupComplete,
  closeIconHidden,
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
      console.log("createuser ==> ", createUser);
      setVerificationCodeMetadata(createUser);
      setActiveScreen(Screen.VerifyCode);
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions, message }) => {
        // console.log('code = => ', code)
        // const { code } = extensions as { code?: keyof typeof ERROR_CODES };
        const { code } = extensions as { code?: string };
        if (code === "ALREADY_EXISTS") {
          setErrorMessage(message);
        } else {
          throw new ApolloError({ graphQLErrors });
        }
      });
    },
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
    void createUser({
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
            errorMessage={errorMessage}
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
    <AuthModalLayout
      show={show}
      close={close}
      closeIconHidden={closeIconHidden}
    >
      {renderContent()}
    </AuthModalLayout>
  );
};
