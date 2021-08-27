import React, { VoidFunctionComponent } from "react";
import { unstable_batchedUpdates } from "react-dom";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import {
  AuthModalLayout,
  AuthModalLayoutProps,
} from "../../Modals/AuthModal/AuthModalLayout";
import { LoginIntro } from "../../pages/auth/login/LoginIntro";
import { VerifyCode } from "../../pages/auth/VerifyCode";
import {
  VerificationCodeMetadata,
  LoginWithLoginCodeMutation,
  MutationLoginWithLoginCodeArgs,
  SendLoginCodeMutation,
  SendLoginCodeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { ApolloError, useMutation } from "@apollo/client";
import {
  sendLoginCode as sendLoginCodeMutation,
  loginWithLoginCode as loginWithLoginCodeMutation,
} from "../../../graphql/queries/user.queries";
import {
  AUTH_ERROR_CODES,
  isParsedAuthQuery,
  SYNTHETIC_LOADING_TIME_MS,
} from "../../pages/auth/utils";

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

type LoginModalProps = {
  onLoggedIn?: (user: LoginWithLoginCodeMutation["loginWithLoginCode"]) => void;
} & Omit<AuthModalLayoutProps, "children">;

export const LoginModal: VoidFunctionComponent<LoginModalProps> = ({
  show,
  onClose,
  onLoggedIn,
}) => {
  const router = useRouter();

  // TODO: refactor to use useReducer
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.Intro);
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [verificationCodeMetadata, setVerificationCodeMetadata] = useState<
    VerificationCodeMetadata | undefined
  >();
  const [errorMessage, setErrorMessage] = useState<string>("");
  // synthetic loading state to be used when delaying the loginWithLoginCode request using a timeout
  const [syntheticLoading, setSyntheticLoading] = useState<boolean>(false);

  const [sendLoginCodeFn, { loading: sendLoginCodeLoading }] = useMutation<
    SendLoginCodeMutation,
    SendLoginCodeMutationVariables
  >(sendLoginCodeMutation, {
    onCompleted: ({ sendLoginCode }) => {
      unstable_batchedUpdates(() => {
        setErrorMessage("");
        setVerificationCodeMetadata(sendLoginCode);
        setActiveScreen(Screen.VerifyCode);
      });
    },
    onError: ({ graphQLErrors }) =>
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        if (code === "NOT_FOUND") {
          setErrorMessage(message);
        } else {
          throw new ApolloError({ graphQLErrors });
        }
      }),
  });

  const [loginWithLoginCode, { loading: loginWithLoginCodeLoading }] =
    useMutation<LoginWithLoginCodeMutation, MutationLoginWithLoginCodeArgs>(
      loginWithLoginCodeMutation,
      {
        onCompleted: ({ loginWithLoginCode }) => {
          setSyntheticLoading(false);
          if (onLoggedIn) onLoggedIn(loginWithLoginCode);
        },
        onError: ({ graphQLErrors }) =>
          unstable_batchedUpdates(() => {
            setSyntheticLoading(false);
            graphQLErrors.forEach(({ extensions }) => {
              const { code } = extensions as {
                code?: keyof typeof AUTH_ERROR_CODES;
              };

              if (code && Object.keys(AUTH_ERROR_CODES).includes(code)) {
                setErrorMessage(AUTH_ERROR_CODES[code]);
              } else {
                throw new ApolloError({ graphQLErrors });
              }
            });
          }),
      }
    );

  // handles when user clicks on the link sent to their email
  useEffect(() => {
    const { pathname, query } = router;
    if (pathname === "/login" && isParsedAuthQuery(query)) {
      const { verificationId, verificationCode } = query;

      unstable_batchedUpdates(() => {
        setActiveScreen(Screen.VerifyCode);
        setVerificationCode(verificationCode);
      });

      void loginWithLoginCode({
        variables: { verificationId, verificationCode },
      });
    }
  }, [router, loginWithLoginCode]);

  const requestLoginCode = (emailOrShortname: string) => {
    setLoginIdentifier(emailOrShortname);
    void sendLoginCodeFn({ variables: { emailOrShortname } });
  };

  const login = (providedCode?: string) => {
    if (!verificationCodeMetadata) return;

    const verificationId = verificationCodeMetadata.id;

    if (providedCode) {
      setSyntheticLoading(true);
      setTimeout(
        () =>
          loginWithLoginCode({
            variables: { verificationId, verificationCode: providedCode },
          }),
        SYNTHETIC_LOADING_TIME_MS
      );
    } else {
      void loginWithLoginCode({
        variables: { verificationId, verificationCode },
      });
    }
  };

  const resendLoginCode = () => {
    void requestLoginCode(loginIdentifier);
  };

  const goBack = () => {
    if (activeScreen === Screen.VerifyCode) {
      unstable_batchedUpdates(() => {
        setActiveScreen(Screen.Intro);
        setErrorMessage("");
        setVerificationCodeMetadata(undefined);
        setVerificationCode("");
      });
    }
  };

  const navigateToSignup = () => {
    void router.push("/signup");
    setTimeout(onClose, 500);
  };

  const renderContent = () => {
    switch (activeScreen) {
      case Screen.VerifyCode:
        return (
          <VerifyCode
            loginIdentifier={loginIdentifier}
            code={verificationCode}
            setCode={setVerificationCode}
            goBack={goBack}
            handleSubmit={login}
            loading={loginWithLoginCodeLoading || syntheticLoading}
            requestCode={resendLoginCode}
            requestCodeLoading={sendLoginCodeLoading}
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
            navigateToSignup={navigateToSignup}
          />
        );
    }
  };

  if (!show && activeScreen !== Screen.Intro) {
    setActiveScreen(Screen.Intro);
  }

  return (
    <AuthModalLayout show={show} onClose={onClose}>
      {renderContent()}
    </AuthModalLayout>
  );
};
