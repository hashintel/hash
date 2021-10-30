import React, {
  VoidFunctionComponent,
  useEffect,
  useReducer,
  useMemo,
  useCallback,
  useState,
} from "react";
import { useRouter } from "next/router";

import { ApolloError, useMutation } from "@apollo/client";
import { AuthModalLayout, AuthModalLayoutProps } from "./AuthModalLayout";
import { LoginIntro as LoginIntroScreen } from "../../pages/auth/login/LoginIntro";
import { VerifyCode as VerifyCodeScreen } from "../../pages/auth/VerifyCode";
import {
  VerificationCodeMetadata,
  LoginWithLoginCodeMutation,
  MutationLoginWithLoginCodeArgs,
  SendLoginCodeMutation,
  SendLoginCodeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  sendLoginCode as sendLoginCodeMutation,
  loginWithLoginCode as loginWithLoginCodeMutation,
} from "../../../graphql/queries/user.queries";
import {
  AUTH_ERROR_CODES,
  isParsedAuthQuery,
  SYNTHETIC_LOADING_TIME_MS,
  Action,
} from "../../pages/auth/utils";
import { useGetInvitationInfo } from "../../hooks/useGetInvitationInfo";

enum Screen {
  Intro,
  VerifyCode,
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

type Actions =
  | Action<"SEND_LOGIN_CODE_SUCCESS", Pick<State, "verificationCodeMetadata">>
  | Action<"SET_ERROR", string>
  | Action<"UPDATE_STATE", Partial<State>>
  | Action<"RESET_STATE">;

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
  const { invitationInfo, invitationInfoLoading } = useGetInvitationInfo();
  const router = useRouter();
  const [requestedLoginCodeForDefault, setRequestedLoginCodeForDefault] =
    useState<boolean>(false);

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
        onCompleted: ({ loginWithLoginCode: user }) => {
          if (syntheticLoading) {
            dispatch({
              type: "UPDATE_STATE",
              payload: {
                syntheticLoading: false,
              },
            });
          }
          if (onLoggedIn) onLoggedIn(user);
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
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          activeScreen: Screen.VerifyCode,
          verificationCode: query.verificationCode,
        },
      });

      void loginWithLoginCode({
        variables: {
          verificationId: query.verificationId,
          verificationCode: query.verificationCode,
        },
      });
    }
  }, [router, loginWithLoginCode]);

  const requestLoginCode = useCallback(
    (emailOrShortname: string) => {
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          loginIdentifier: emailOrShortname,
        },
      });
      void sendLoginCodeFn({ variables: { emailOrShortname } });
    },
    [sendLoginCodeFn]
  );

  const defaultLoginIdentifier = useMemo(() => {
    const { email, shortname } = router.query;
    const identifier = email || shortname;

    if (typeof identifier === "string") {
      return identifier;
    }
  }, [router]);

  useEffect(() => {
    if (
      defaultLoginIdentifier &&
      !requestedLoginCodeForDefault &&
      activeScreen === Screen.Intro
    ) {
      setRequestedLoginCodeForDefault(true);
      requestLoginCode(defaultLoginIdentifier);
    }
  }, [
    requestedLoginCodeForDefault,
    defaultLoginIdentifier,
    invitationInfo,
    router,
    activeScreen,
    requestLoginCode,
  ]);

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

  const renderContent = () => {
    switch (activeScreen) {
      case Screen.VerifyCode:
        return (
          <VerifyCodeScreen
            loginIdentifier={loginIdentifier}
            defaultCode={verificationCode}
            goBack={goBack}
            handleSubmit={login}
            loading={loginWithLoginCodeLoading || syntheticLoading}
            requestCode={resendLoginCode}
            requestCodeLoading={sendLoginCodeLoading}
            errorMessage={errorMessage}
            invitationInfo={invitationInfo}
          />
        );
      case Screen.Intro:
      default:
        return (
          <LoginIntroScreen
            requestLoginCode={requestLoginCode}
            loading={sendLoginCodeLoading}
            errorMessage={errorMessage}
            invitationInfo={invitationInfo}
            defaultLoginIdentifier={defaultLoginIdentifier}
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
    <AuthModalLayout
      loading={invitationInfoLoading}
      show={show}
      onClose={onClose}
    >
      {renderContent()}
    </AuthModalLayout>
  );
};
