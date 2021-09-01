import React, { VoidFunctionComponent } from "react";
import { useRouter } from "next/router";
import { useEffect, useReducer } from "react";

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

type State = {
  activeScreen: Screen;
  loginIdentifier: string;
  verificationCode: string;
  verificationCodeMetadata: VerificationCodeMetadata | undefined;
  errorMessage: string;
  syntheticLoading: boolean;
};

type Action<S, T> = {
  type: S;
  payload?: T;
};

type Actions =
  | Action<"SEND_LOGIN_CODE_SUCCESS", Pick<State, "verificationCodeMetadata">>
  | Action<"SET_ERROR", string>
  | Action<"UPDATE_STATE", Partial<State>>
  | Action<"RESET_STATE", undefined>;

const initialState: State = {
  activeScreen: Screen.Intro,
  loginIdentifier: "",
  verificationCodeMetadata: undefined,
  verificationCode: "",
  errorMessage: "",
  syntheticLoading: false,
};

function reducer(state: State, action: Actions): State {
  switch (action.type) {
    case "SEND_LOGIN_CODE_SUCCESS":
      return {
        ...state,
        ...action.payload,
        activeScreen: Screen.VerifyCode,
        errorMessage: "",
      };
    case "SET_ERROR":
      return {
        ...state,
        errorMessage: action.payload || "",
      };
    case "UPDATE_STATE":
      return {
        ...state,
        ...action.payload,
      };
    case "RESET_STATE":
      return initialState;
    default:
      return state;
  }
}

export const LoginModal: VoidFunctionComponent<LoginModalProps> = ({
  show,
  onClose,
  onLoggedIn,
}) => {
  const [
    {
      activeScreen,
      loginIdentifier,
      verificationCode,
      verificationCodeMetadata,
      errorMessage,
      syntheticLoading,
    },
    dispatch,
  ] = useReducer<React.Reducer<State, Actions>>(reducer, initialState);
  const router = useRouter();

  const [sendLoginCodeFn, { loading: sendLoginCodeLoading }] = useMutation<
    SendLoginCodeMutation,
    SendLoginCodeMutationVariables
  >(sendLoginCodeMutation, {
    onCompleted: ({ sendLoginCode }) => {
      dispatch({
        type: "SEND_LOGIN_CODE_SUCCESS",
        payload: { verificationCodeMetadata: sendLoginCode },
      });
    },
    onError: ({ graphQLErrors }) =>
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        if (code === "NOT_FOUND") {
          dispatch({
            type: "SET_ERROR",
            payload: message,
          });
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
          if (syntheticLoading) {
            dispatch({
              type: "UPDATE_STATE",
              payload: {
                syntheticLoading: false,
              },
            });
          }
          if (onLoggedIn) onLoggedIn(loginWithLoginCode);
        },
        onError: ({ graphQLErrors }) =>
          graphQLErrors.forEach(({ extensions }) => {
            const { code } = extensions as {
              code?: keyof typeof AUTH_ERROR_CODES;
            };

            if (code && Object.keys(AUTH_ERROR_CODES).includes(code)) {
              dispatch({
                type: "SET_ERROR",
                payload: AUTH_ERROR_CODES[code],
              });
            } else {
              throw new ApolloError({ graphQLErrors });
            }
          }),
      }
    );

  // handles when user clicks on the link sent to their email
  useEffect(() => {
    const { pathname, query } = router;
    if (pathname === "/login" && isParsedAuthQuery(query)) {
      const { verificationId, verificationCode } = query;

      dispatch({
        type: "UPDATE_STATE",
        payload: {
          activeScreen: Screen.VerifyCode,
          verificationCode: verificationCode,
        },
      });

      void loginWithLoginCode({
        variables: { verificationId, verificationCode },
      });
    }
  }, [router, loginWithLoginCode]);

  const requestLoginCode = (emailOrShortname: string) => {
    dispatch({
      type: "UPDATE_STATE",
      payload: {
        loginIdentifier: emailOrShortname,
      },
    });
    void sendLoginCodeFn({ variables: { emailOrShortname } });
  };

  const login = (providedCode: string, withSynthenticLoading?: boolean) => {
    if (!verificationCodeMetadata) return;

    const verificationId = verificationCodeMetadata.id;

    if (withSynthenticLoading) {
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          syntheticLoading: true,
        },
      });
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
      dispatch({ type: "RESET_STATE" });
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
            defaultCode={verificationCode}
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
    dispatch({
      type: "UPDATE_STATE",
      payload: {
        activeScreen: Screen.Intro,
      },
    });
  }

  return (
    <AuthModalLayout show={show} onClose={onClose}>
      {renderContent()}
    </AuthModalLayout>
  );
};
