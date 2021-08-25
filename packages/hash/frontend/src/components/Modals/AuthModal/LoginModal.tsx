import React, { VoidFunctionComponent } from "react";
import { useRouter } from "next/router";
import { ParsedUrlQueryInput } from "querystring";
import { useEffect, useState } from "react";

import { ModalProps } from "../Modal";
import { Layout } from "./Layout";
import { LoginIntro } from "./LoginIntro";
import { VerifyCode } from "./VerifyCode";
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

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

type ParsedLoginQuery = {
  verificationId: string;
  verificationCode: string;
};

const isParsedLoginQuery = (
  tbd: ParsedUrlQueryInput
): tbd is ParsedLoginQuery =>
  typeof tbd.verificationId === "string" &&
  typeof tbd.verificationCode === "string";

type LoginModalProps = {
  onLoggedIn?: () => void;
} & Omit<ModalProps, "children">;

const ERROR_CODES = {
  LOGIN_CODE_NOT_FOUND: "An unexpected error occurred, please try again.",
  MAX_ATTEMPTS:
    "You have exceeded the maximum number of attempts for this login code, please try again.",
  EXPIRED: "This login code has expired, please try again.",
  INCORRECT: "This login code has expired, please try again.",
  NOT_FOUND: "",
} as const;

export const LoginModal: VoidFunctionComponent<LoginModalProps> = ({
  show,
  close,
  onLoggedIn,
}) => {
  // TODO: refactor to use useReducer
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.VerifyCode);
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [verificationCodeMetadata, setVerificationCodeMetadata] = useState<
    VerificationCodeMetadata | undefined
  >();
  const [errorMessage, setErrorMessage] = useState<string>("");
  const router = useRouter();

  const [sendLoginCodeFn, { loading: sendLoginCodeLoading }] = useMutation<
    SendLoginCodeMutation,
    SendLoginCodeMutationVariables
  >(sendLoginCodeMutation, {
    onCompleted: ({ sendLoginCode }) => {
      setErrorMessage("");
      setVerificationCodeMetadata(sendLoginCode);
      setActiveScreen(Screen.VerifyCode);
    },
    onError: ({ graphQLErrors }) =>
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: keyof typeof ERROR_CODES };
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
        onCompleted: () => {
          if (onLoggedIn) onLoggedIn();
        },
        onError: ({ graphQLErrors }) =>
          graphQLErrors.forEach(({ extensions }) => {
            const { code } = extensions as { code?: keyof typeof ERROR_CODES };

            if (code && Object.keys(ERROR_CODES).includes(code)) {
              setErrorMessage(ERROR_CODES[code]);
            } else {
              throw new ApolloError({ graphQLErrors });
            }
          }),
      }
    );

  // handle magic link
  useEffect(() => {
    const { pathname, query } = router;
    if (pathname === "/login" && isParsedLoginQuery(query)) {
      const { verificationId, verificationCode } = query;
      setActiveScreen(Screen.VerifyCode);
      setVerificationCode(verificationCode);
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
    void sendLoginCodeFn({ variables: { emailOrShortname } });
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
    if (activeScreen === Screen.VerifyCode) {
      setActiveScreen(Screen.Intro);
      setErrorMessage("");
      setVerificationCodeMetadata(undefined);
      setVerificationCode("");
    }
  };

  const navigateToSignup = () => {
    router.push("/signup");
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
            navigateToSignup={navigateToSignup}
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
