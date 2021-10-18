import React, { useEffect, useRef, useReducer } from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useMutation } from "@apollo/client";
import { useUser } from "../components/hooks/useUser";

import { SignupIntro as SignupIntroScreen } from "../components/pages/auth/signup/SignupIntro";
import { VerifyCode as VerifyCodeScreen } from "../components/pages/auth/VerifyCode";
import { AccountSetup as AccountSetupScreen } from "../components/pages/auth/signup/AccountSetup";
import { AccountUsage as AccountUsageScreen } from "../components/pages/auth/signup/AccountUsage";
import { OrgCreate as OrgCreateScreen } from "../components/pages/auth/signup/OrgCreate";
import { OrgInvite as OrgInviteScreen } from "../components/pages/auth/signup/OrgInvite";

import {
  CreateOrgMutation,
  CreateOrgMutationVariables,
  CreateUserMutation,
  CreateUserMutationVariables,
  OrgSize,
  UpdateUserMutation,
  UpdateUserMutationVariables,
  UpdateUserProperties,
  VerificationCodeMetadata,
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
  WayToUseHash,
  CreateUserWithOrgEmailInvitationMutation,
  CreateUserWithOrgEmailInvitationMutationVariables,
  JoinOrgMutation,
  JoinOrgMutationVariables,
} from "../graphql/apiTypes.gen";
import {
  createUser as createUserMutation,
  updateUser as updateUserMutation,
  verifyEmail as verifyEmailMutation,
  createUserWithOrgEmailInvitation as createUserWithOrgEmailInvitationMutation,
} from "../graphql/queries/user.queries";
import {
  createOrg as createOrgMutation,
  joinOrg as joinOrgMutation,
} from "../graphql/queries/org.queries";
import {
  AUTH_ERROR_CODES,
  isParsedAuthQuery,
  SYNTHETIC_LOADING_TIME_MS,
  Action,
} from "../components/pages/auth/utils";
import { AuthLayout } from "../components/layout/PageLayout/AuthLayout";
import { useGetInvitationInfo } from "../components/hooks/useGetInvitationInfo";

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
  invitationInfo: {
    orgName: string;
    orgEntityId: string;
    inviterPreferredName?: string;
    invitationEmailToken?: string;
    invitationLinkToken?: string;
  } | null;
  createOrgInfo?: {
    invitationLinkToken: string;
    orgEntityId: string;
  };
};

type Actions =
  | Action<"CREATE_USER_SUCCESS", Pick<State, "verificationCodeMetadata">>
  | Action<"VERIFY_EMAIL_SUCCESS", Pick<State, "userEntityId">>
  | Action<"SET_ERROR", string>
  | Action<"UPDATE_STATE", Partial<State>>
  | Action<"CREATE_ORG_SUCCESS", Pick<State, "createOrgInfo">>;

const initialState: State = {
  activeScreen: Screen.Intro,
  email: "",
  verificationCodeMetadata: undefined,
  verificationCode: "",
  errorMessage: "",
  userEntityId: null,
  syntheticLoading: false,
  invitationInfo: null,
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
    case "CREATE_ORG_SUCCESS":
      return {
        ...state,
        ...action.payload,
        activeScreen: Screen.OrgInvite,
        errorMessage: "",
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

/**
 * @todo
 * Error states for entire flow
 *
 */

const SignupPage: NextPage = () => {
  const { user, refetch: refetchUser } = useUser();
  const router = useRouter();
  const [
    {
      activeScreen,
      email,
      verificationCode,
      verificationCodeMetadata,
      errorMessage,
      // userEntityId,
      syntheticLoading,
      createOrgInfo,
    },
    dispatch,
  ] = useReducer<React.Reducer<State, Actions>>(reducer, initialState);
  const { invitationInfo, invitationInfoLoading } = useGetInvitationInfo();
  const accountUsageType = useRef<WayToUseHash | null>(null);

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
    onCompleted: (res) => {
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

  const [
    createUserWithOrgEmailInvite,
    { loading: createUserWithOrgEmailInviteLoading },
  ] = useMutation<
    CreateUserWithOrgEmailInvitationMutation,
    CreateUserWithOrgEmailInvitationMutationVariables
  >(createUserWithOrgEmailInvitationMutation, {
    onCompleted: async ({ createUserWithOrgEmailInvitation }) => {
      await refetchUser();
      const createdEmail =
        createUserWithOrgEmailInvitation.properties.emails.find(
          ({ primary, verified }) => primary && verified
        );
      // const createdUserEntityId = createUserWithOrgEmailInvitation.entityId;

      dispatch({
        type: "UPDATE_STATE",
        payload: {
          activeScreen: Screen.AccountSetup,
          email: createdEmail?.address,
          // userEntityId: createdUserEntityId,
        },
      });
    },
  });

  const [verifyEmail, { loading: verifyEmailLoading }] = useMutation<
    VerifyEmailMutation,
    VerifyEmailMutationVariables
  >(verifyEmailMutation, {
    onCompleted: async ({ verifyEmail: returnedUser }) => {
      await refetchUser();
      // @todo remove the need for userEntityId
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
    onCompleted: async (res) => {
      // for normal flow, accountUsageType is null. Direct user to accountUsage setup
      // @todo update user cache with updateUser data instead of refetching here
      await refetchUser();

      if (res.updateUser.accountSignupComplete) {
        if (!accountUsageType.current) {
          updateState({
            activeScreen: Screen.AccountUsage,
            errorMessage: "",
          });
          return;
        }

        if (accountUsageType.current === WayToUseHash.WithATeam) {
          updateState({
            activeScreen: Screen.OrgCreate,
            errorMessage: "",
          });
          return;
        }

        void router.push(`/${res.updateUser.accountId}`);
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
    onCompleted: (res) => {
      const accessToken =
        res.createOrg.properties.invitationLink?.data.properties.accessToken;
      if (accessToken && res.createOrg.accountId) {
        dispatch({
          type: "CREATE_ORG_SUCCESS",
          payload: {
            createOrgInfo: {
              orgEntityId: res.createOrg.accountId,
              invitationLinkToken: accessToken,
            },
          },
        });
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

  const [joinOrg, { loading: joinOrgLoading }] = useMutation<
    JoinOrgMutation,
    JoinOrgMutationVariables
  >(joinOrgMutation, {
    onCompleted: (_) => {
      // redirect to home page
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

  useEffect(() => {
    const { pathname, query } = router;

    if (!router.isReady || pathname !== "/signup") return;

    // handles when user clicks on the verification link sent to their email
    if (isParsedAuthQuery(query)) {
      updateState({
        activeScreen: Screen.VerifyCode,
        verificationCode: query.verificationCode,
      });
      void verifyEmail({
        variables: {
          verificationId: query.verificationId,
          verificationCode: query.verificationCode,
        },
      });
    }
  }, [router, verifyEmail]);

  useEffect(() => {
    if (invitationInfoLoading || !invitationInfo) return;

    if (invitationInfo.invitationEmailToken) {
      void createUserWithOrgEmailInvite({
        variables: {
          invitationEmailToken: invitationInfo.invitationEmailToken,
          orgEntityId: invitationInfo.orgEntityId,
        },
      });
    }
  }, [invitationInfo, invitationInfoLoading, createUserWithOrgEmailInvite]);

  const requestVerificationCode = (providedEmail: string) => {
    updateState({ email: providedEmail });
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

  const updateUserDetails = async ({
    shortname,
    preferredName,
    usingHow,
  }: {
    shortname?: string;
    preferredName?: string;
    usingHow?: WayToUseHash;
  }) => {
    if (!user) return;
    const properties = {} as UpdateUserProperties;

    if (shortname) {
      properties.shortname = shortname;
    }
    if (preferredName) {
      properties.preferredName = preferredName;
    }
    if (usingHow) {
      properties.usingHow = usingHow;
    }

    await updateUser({
      variables: {
        userEntityId: user.entityId,
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

  const handleAccountSetup = async ({
    shortname,
    preferredName,
    responsibility,
  }: {
    shortname?: string;
    preferredName?: string;
    responsibility?: string;
  }) => {
    await updateUserDetails({
      shortname,
      preferredName,
      ...(invitationInfo && { usingHow: WayToUseHash.WithATeam }),
    });

    /** join organization once update user details has been completed  */
    if (responsibility && invitationInfo) {
      void joinOrg({
        variables: {
          orgEntityId: invitationInfo.orgEntityId,
          verification: {
            ...(invitationInfo.invitationEmailToken && {
              invitationEmailToken: invitationInfo.invitationEmailToken,
            }),
            ...(invitationInfo.invitationLinkToken && {
              invitationLinkToken: invitationInfo.invitationLinkToken,
            }),
          },
          responsibility,
        },
      });
    }
  };

  const handleCreateOrganization = ({
    responsibility,
    shortname,
    name,
    orgSize,
  }: {
    responsibility: string;
    shortname: string;
    name: string;
    orgSize: OrgSize;
  }) => {
    void createOrg({
      variables: {
        org: {
          shortname,
          name,
          orgSize,
        },
        responsibility,
      },
    });
  };

  const goBack = () => {
    if (activeScreen === Screen.VerifyCode) {
      updateState({ activeScreen: Screen.Intro });
    }
  };

  const navigateToHome = () => {
    void router.push(user ? `/${user.accountId}` : "/");
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
      loading={invitationInfoLoading || createUserWithOrgEmailInviteLoading}
    >
      {activeScreen === Screen.Intro && (
        <SignupIntroScreen
          loading={createUserLoading}
          errorMessage={errorMessage}
          handleSubmit={requestVerificationCode}
          invitationInfo={invitationInfo}
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
          invitationInfo={invitationInfo}
        />
      )}
      {activeScreen === Screen.AccountSetup && (
        <AccountSetupScreen
          onSubmit={handleAccountSetup}
          loading={updateUserLoading || joinOrgLoading}
          errorMessage={errorMessage}
          email={email}
          invitationInfo={invitationInfo}
        />
      )}
      {activeScreen === Screen.AccountUsage && (
        <AccountUsageScreen
          updateWayToUseHash={updateWayToUseHash}
          loading={updateUserLoading}
          errorMessage={errorMessage}
        />
      )}
      {activeScreen === Screen.OrgCreate && (
        <OrgCreateScreen
          createOrg={handleCreateOrganization}
          loading={createOrgLoading}
        />
      )}
      {activeScreen === Screen.OrgInvite && createOrgInfo && (
        <OrgInviteScreen
          createOrgInfo={createOrgInfo}
          navigateToHome={navigateToHome}
        />
      )}
    </AuthLayout>
  );
};

export default SignupPage;
