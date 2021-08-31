import React, { useEffect } from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useUser } from "../components/hooks/useUser";

import { SignupIntro } from "../components/pages/auth/signup/SignupIntro";
import { VerifyCode } from "../components/pages/auth/VerifyCode";
import { AccountSetup } from "../components/pages/auth/signup/AccountSetup";

import { useMutation } from "@apollo/client";
import {
  CreateUserMutation,
  CreateUserMutationVariables,
  UpdateUserMutation,
  UpdateUserMutationVariables,
  VerificationCodeMetadata,
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
} from "../graphql/apiTypes.gen";
import {
  createUser as createUserMutation,
  updateUser as updateUserMutation,
  verifyEmail as verifyEmailMutation,
} from "../graphql/queries/user.queries";
import {
  AUTH_ERROR_CODES,
  isParsedAuthQuery,
  SYNTHETIC_LOADING_TIME_MS,
} from "../components/pages/auth/utils";
import { AuthLayout } from "../components/layout/PageLayout/AuthLayout";
import { useReducer } from "react";

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

type State = {
  activeScreen: Screen;
  email: string;
  verificationCodeMetadata: VerificationCodeMetadata | undefined;
  verificationCode: string;
  errorMessage: string;
  userId: string | null;
  syntheticLoading: boolean;
};

type Action<S, T> = {
  type: S;
  payload: T;
};

type Actions =
  | Action<"CREATE_USER_SUCCESS", Pick<State, "verificationCodeMetadata">>
  | Action<"VERIFY_EMAIL_SUCCESS", Pick<State, "userId">>
  | Action<"SET_ERROR", string>
  | Action<"UPDATE_STATE", State>;

const initialState: State = {
  activeScreen: Screen.Intro,
  email: "",
  verificationCodeMetadata: undefined,
  verificationCode: "",
  errorMessage: "",
  userId: null,
  syntheticLoading: false,
};

function reducer(state: State, action: Actions): State {
  switch (action.type) {
    case "CREATE_USER_SUCCESS":
      return {
        ...state,
        ...action.payload,
        activeScreen: Screen.VerifyCode,
        errorMessage: "",
      };
    case "VERIFY_EMAIL_SUCCESS":
      return {
        ...state,
        ...action.payload,
        activeScreen: Screen.AccountSetup,
        syntheticLoading: false,
        errorMessage: "",
      };
    case "SET_ERROR":
      return {
        ...state,
        syntheticLoading: false,
        errorMessage: action.payload,
      };
    case "UPDATE_STATE":
      return {
        ...state,
        ...action.payload,
      };
    default:
      return state;
  }
}

const SignupPage: NextPage = () => {
  const { user, refetch } = useUser();
  const router = useRouter();
  const [
    {
      activeScreen,
      email,
      verificationCode,
      verificationCodeMetadata,
      errorMessage,
      userId,
      syntheticLoading,
    },
    dispatch,
  ] = useReducer<React.Reducer<State, Actions>>(reducer, initialState);

  useEffect(() => {
    // If the user is logged in, and their account sign-up is complete...
    if (user && user.accountSignupComplete) {
      // ...redirect them to the homepage
      void router.push("/");
    }
  }, [user, router]);

  const [createUser, { loading: createUserLoading }] = useMutation<
    CreateUserMutation,
    CreateUserMutationVariables
  >(createUserMutation, {
    onCompleted: ({ createUser }) => {
      dispatch({
        type: "CREATE_USER_SUCCESS",
        payload: { verificationCodeMetadata: createUser },
      });
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        if (code === "ALREADY_EXISTS") {
          void router.push({ pathname: "/login", query: { email } });
        } else {
          dispatch({
            type: "SET_ERROR",
            payload: code ? AUTH_ERROR_CODES[code] : message,
          });
        }
      });
    },
  });

  const [verifyEmail, { loading: verifyEmailLoading }] = useMutation<
    VerifyEmailMutation,
    VerifyEmailMutationVariables
  >(verifyEmailMutation, {
    onCompleted: ({ verifyEmail: data }) => {
      dispatch({
        type: "VERIFY_EMAIL_SUCCESS",
        payload: { userId: data.id },
      });
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        dispatch({
          type: "SET_ERROR",
          payload: code ? AUTH_ERROR_CODES[code] : message,
        });
      });
    },
  });

  const [updateUser, { loading: updateUserLoading }] = useMutation<
    UpdateUserMutation,
    UpdateUserMutationVariables
  >(updateUserMutation, {
    onCompleted: ({}) => {
      void refetch();
      void router.push("/");
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ message }) => {
        dispatch({
          type: "SET_ERROR",
          payload: message,
        });
      });
    },
  });

  // handles when user clicks on the link sent to their email
  useEffect(() => {
    const { pathname, query } = router;
    if (pathname === "/signup" && isParsedAuthQuery(query)) {
      const { verificationId, verificationCode } = query;
      dispatch({
        type: "UPDATE_STATE",
        payload: { activeScreen: Screen.VerifyCode, verificationCode } as State,
      });
      void verifyEmail({
        variables: { verificationId, verificationCode },
      });
    }
  }, [router, verifyEmail]);

  const requestVerificationCode = (email: string) => {
    dispatch({ type: "UPDATE_STATE", payload: { email } as State });
    void createUser({
      variables: { email },
    });
  };

  const handleVerifyEmail = (
    providedCode: string,
    withSyntheticLoading?: boolean
  ) => {
    if (!verificationCodeMetadata) return;

    const verificationId = verificationCodeMetadata.id;

    if (withSyntheticLoading) {
      dispatch({
        type: "UPDATE_STATE",
        payload: { syntheticLoading: true } as State,
      });
      setTimeout(
        () =>
          verifyEmail({
            variables: { verificationId, verificationCode: providedCode },
          }),
        SYNTHETIC_LOADING_TIME_MS
      );
    } else {
      void verifyEmail({
        variables: { verificationId, verificationCode: providedCode },
      });
    }
  };

  const updateUserDetails = (shortname: string, preferredName: string) => {
    if (!userId) return;
    void updateUser({
      variables: { id: userId, properties: { shortname, preferredName } },
    });
  };

  const goBack = () => {
    if (activeScreen === Screen.VerifyCode) {
      dispatch({
        type: "UPDATE_STATE",
        payload: { activeScreen: Screen.Intro } as State,
      });
    }
  };

  // handles when the user is logged in but hasn't finished setting up his account
  if (
    user &&
    !user.accountSignupComplete &&
    activeScreen !== Screen.AccountSetup
  ) {
    dispatch({
      type: "UPDATE_STATE",
      payload: {
        userId: user.id,
        activeScreen: Screen.AccountSetup,
      } as State,
    });
  }

  return (
    <AuthLayout>
      {activeScreen === Screen.Intro && (
        <SignupIntro
          loading={createUserLoading}
          errorMessage={errorMessage}
          handleSubmit={requestVerificationCode}
        />
      )}
      {activeScreen === Screen.VerifyCode && (
        <VerifyCode
          loginIdentifier={email}
          goBack={goBack}
          defaultCode={verificationCode}
          loading={verifyEmailLoading || syntheticLoading}
          handleSubmit={handleVerifyEmail}
          errorMessage={errorMessage}
          requestCodeLoading={false}
          requestCode={() => {}}
        />
      )}
      {activeScreen === Screen.AccountSetup && (
        <AccountSetup
          updateUserDetails={updateUserDetails}
          loading={updateUserLoading}
          errorMessage={errorMessage}
        />
      )}
    </AuthLayout>
  );
};

export default SignupPage;
