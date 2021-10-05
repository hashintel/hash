import React, { useEffect, useRef } from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { tw } from "twind";
import { useUser } from "../components/hooks/useUser";

import { SignupIntro } from "../components/pages/auth/signup/SignupIntro";
import { VerifyCode } from "../components/pages/auth/VerifyCode";
import { AccountSetup } from "../components/pages/auth/signup/AccountSetup";
import { AccountUsage } from "../components/pages/auth/signup/AccountUsage";
import { OrgCreate } from "../components/pages/auth/signup/OrgCreate";
import { OrgInvite } from "../components/pages/auth/signup/OrgInvite";

import {
  CreateOrgMutation,
  CreateOrgMutationVariables,
  CreateUserMutation,
  CreateUserMutationVariables,
  UpdateUserMutation,
  UpdateUserMutationVariables,
  UpdateUserProperties,
  VerificationCodeMetadata,
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
  WayToUseHash,
} from "../graphql/apiTypes.gen";
import {
  createUser as createUserMutation,
  updateUser as updateUserMutation,
  verifyEmail as verifyEmailMutation,
} from "../graphql/queries/user.queries";
import { createOrg as createOrgMutation } from "../graphql/queries/org.queries";
import {
  AUTH_ERROR_CODES,
  isParsedAuthQuery,
  SYNTHETIC_LOADING_TIME_MS,
  Action,
} from "../components/pages/auth/utils";
import { AuthLayout } from "../components/layout/PageLayout/AuthLayout";

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
  AccountUsage,
  OrgCreate,
  OrgInvite,
}

type State = {
  activeScreen: Screen;
  email: string;
  verificationCodeMetadata: VerificationCodeMetadata | undefined;
  verificationCode: string;
  errorMessage: string;
  userEntityId: string | null;
  syntheticLoading: boolean;
  orgEntityId: string | null;
};

type Actions =
  | Action<"CREATE_USER_SUCCESS", Pick<State, "verificationCodeMetadata">>
  | Action<"VERIFY_EMAIL_SUCCESS", Pick<State, "userEntityId">>
  | Action<"SET_ERROR", string>
  | Action<"UPDATE_STATE", Partial<State>>;

const initialState: State = {
  activeScreen: Screen.Intro,
  email: "",
  verificationCodeMetadata: undefined,
  verificationCode: "",
  errorMessage: "",
  userEntityId: null,
  syntheticLoading: false,
  orgEntityId: null,
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
      userEntityId,
      syntheticLoading,
      orgEntityId,
    },
    dispatch,
  ] = useReducer<React.Reducer<State, Actions>>(reducer, initialState);
  const accountUsageType = useRef<WayToUseHash | null>(null);

  useEffect(() => {
    // If the user is logged in, and their account sign-up is complete...
    // ...redirect them to the homepage
    // if (user && user.accountSignupComplete) {
    //   void router.push(`/${user.accountId}`);
    // }
  }, [user, router]);

  const updateState = (properties: Partial<State>) => {
    dispatch({
      type: "UPDATE_STATE",
      payload: properties,
    });
  };

  const [createUser, { loading: createUserLoading }] = useMutation<
    CreateUserMutation,
    CreateUserMutationVariables
  >(createUserMutation, {
    onCompleted: ({ createUser }) => {
      console.log("createUser ==> ", createUser);
      dispatch({
        type: "CREATE_USER_SUCCESS",
        payload: { verificationCodeMetadata: res.createUser },
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
    onCompleted: ({ verifyEmail: returnedUser }) => {
      dispatch({
        type: "VERIFY_EMAIL_SUCCESS",
        payload: { userEntityId: returnedUser.entityId },
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
    onCompleted: ({ updateUser }) => {
      // for normal flow, accountUsageType is null. Direct user to accountUsage setup
      // @todo update user cache instead of refetching here
      void refetch();
      if (updateUser.accountSignupComplete) {
        if (!accountUsageType.current) {
          updateState({
            activeScreen: Screen.AccountUsage,
            errorMessage: "",
          });
          return;
        }

        if (accountUsageType.current == WayToUseHash.WithATeam) {
          updateState({
            activeScreen: Screen.OrgCreate,
            errorMessage: "",
          });
          return;
        }

        void router.push(`/${updateUser.accountId}`);
      }
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

  const [createOrg, { loading: createOrgLoading }] = useMutation<
    CreateOrgMutation,
    CreateOrgMutationVariables
  >(createOrgMutation, {
    onCompleted: ({ createOrg }) => {
      updateState({
        orgEntityId: createOrg.accountId,
      });
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
      updateState({ activeScreen: Screen.VerifyCode, verificationCode });
      void verifyEmail({
        variables: {
          verificationId: query.verificationId,
          verificationCode: query.verificationCode,
        },
      });
    }
  }, [router, verifyEmail]);

  const requestVerificationCode = (email: string) => {
    updateState({ email });
    void createUser({
      variables: { email: providedEmail },
    });
  };

  const resendVerificationCode = () => {
    void requestVerificationCode(email);
  };

  const handleVerifyEmail = (
    providedCode: string,
    withSyntheticLoading?: boolean
  ) => {
    if (!verificationCodeMetadata) return;

    const verificationId = verificationCodeMetadata.id;

    if (withSyntheticLoading) {
      updateState({ syntheticLoading: true });
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

  const updateUserDetails = ({
    shortname,
    preferredName,
    usingHow,
  }: {
    shortname?: string;
    preferredName?: string;
    usingHow?: WayToUseHash;
  }) => {
    if (!userEntityId) return;
    let properties = {} as UpdateUserProperties;

    if (shortname) {
      properties.shortname = shortname;
    }
    if (preferredName) {
      properties.preferredName = preferredName;
    }
    if (usingHow) {
      properties.usingHow = usingHow;
    }

    void updateUser({
      variables: {
        userEntityId,
        properties,
      },
    });
  };

  const updateWayToUseHash = (usingHow?: WayToUseHash) => {
    if (usingHow) {
      accountUsageType.current = usingHow;
    }

    updateUserDetails({
      usingHow,
    });
  };

  const goBack = () => {
    if (activeScreen === Screen.VerifyCode) {
      updateState({ activeScreen: Screen.Intro });
    }
  };

  // handles when the user is logged in but hasn't finished setting up his account
  if (
    user &&
    !user.accountSignupComplete &&
    activeScreen !== Screen.AccountSetup
  ) {
    updateState({
      userEntityId: user.entityId,
      activeScreen: Screen.AccountSetup,
    });
  }

  return (
    <AuthLayout
      showTopLogo={[
        Screen.AccountUsage,
        Screen.OrgCreate,
        Screen.OrgInvite,
      ].includes(activeScreen)}
    >
      {activeScreen === Screen.Intro && (
        <SignupIntroScreen
          loading={createUserLoading}
          errorMessage={errorMessage}
          handleSubmit={requestVerificationCode}
        />
      )}
      {activeScreen === Screen.VerifyCode && (
        <VerifyCodeScreen
          loginIdentifier={email}
          goBack={goBack}
          defaultCode={verificationCode}
          loading={verifyEmailLoading || syntheticLoading}
          handleSubmit={handleVerifyEmail}
          errorMessage={errorMessage}
          requestCodeLoading={createUserLoading}
          requestCode={resendVerificationCode}
        />
      )}
      {activeScreen === Screen.AccountSetup && (
        <AccountSetupScreen
          updateUserDetails={updateUserDetails}
          loading={updateUserLoading}
          errorMessage={errorMessage}
        />
      )}
      {activeScreen == Screen.AccountUsage && (
        <AccountUsage
          updateWayToUseHash={updateWayToUseHash}
          loading={updateUserLoading}
          errorMessage={errorMessage}
        />
      )}
      {activeScreen == Screen.OrgCreate && <OrgCreate />}
      {activeScreen == Screen.OrgInvite && <OrgInvite />}
    </AuthLayout>
  );
};

export default SignupPage;
