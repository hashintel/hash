import React, { useEffect, useRef, useReducer } from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useMutation, useQuery } from "@apollo/client";
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
  GetOrgEmailInvitationQuery,
  GetOrgEmailInvitationQueryVariables,
  CreateUserWithOrgEmailInvitationMutation,
  CreateUserWithOrgEmailInvitationMutationVariables,
  JoinOrgMutation,
  JoinOrgMutationVariables,
  GetOrgInvitationLinkQuery,
  GetOrgInvitationLinkQueryVariables,
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
  getOrgEmailInvitation,
  getOrgInvitationLink,
} from "../graphql/queries/org.queries";
import {
  AUTH_ERROR_CODES,
  isParsedAuthQuery,
  SYNTHETIC_LOADING_TIME_MS,
  Action,
  isParsedInviteQuery,
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
  invitationInfo: {
    orgName: string;
    orgEntityId: string;
    inviter?: string;
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
 * hook to handle invitationLink and emailInvitationLink
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
      userEntityId,
      syntheticLoading,
      invitationInfo,
      createOrgInfo,
    },
    dispatch,
  ] = useReducer<React.Reducer<State, Actions>>(reducer, initialState);
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
    onCompleted: ({ createUserWithOrgEmailInvitation }) => {
      const createdEmail =
        createUserWithOrgEmailInvitation.properties.emails.find(
          ({ primary, verified }) => primary && verified
        );
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          activeScreen: Screen.AccountSetup,
          email: createdEmail?.address,
        },
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

  /**
   * @todo create a hook that handles fetching invitationLink data and emailInvitationLink Data
   */

  const { loading: getOrgEmailInvitationLoading } = useQuery<
    GetOrgEmailInvitationQuery,
    GetOrgEmailInvitationQueryVariables
  >(getOrgEmailInvitation, {
    variables: {
      orgEntityId: router.query.orgEntityId as string,
      invitationEmailToken: router.query.invitationEmailToken as string,
    },
    skip: !(
      isParsedInviteQuery(router.query) && !!router.query.invitationEmailToken
    ),
    onCompleted: (res) => {
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          invitationInfo: {
            orgEntityId: router.query.orgEntityId as string,
            orgName:
              res.getOrgEmailInvitation.properties.org.data.properties.name ||
              "",
            inviter:
              res.getOrgEmailInvitation.properties.inviter.data.properties
                .preferredName || "",
            invitationEmailToken: router.query.invitationEmailToken as string,
          },
        },
      });

      void createUserWithOrgEmailInvite({
        variables: {
          invitationEmailToken: router.query.invitationEmailToken as string,
          orgEntityId: router.query.orgEntityId as string,
        },
      });
    },
  });

  const { loading: getOrgInvitationLoading } = useQuery<
    GetOrgInvitationLinkQuery,
    GetOrgInvitationLinkQueryVariables
  >(getOrgInvitationLink, {
    variables: {
      orgEntityId: router.query.orgEntityId as string,
      invitationLinkToken: router.query.invitationLinkToken as string,
    },
    skip: !(
      isParsedInviteQuery(router.query) && !!router.query.invitationLinkToken
    ),
    onCompleted: (res) => {
      const orgName =
        res.getOrgInvitationLink.properties.org.data.properties.name;

      if (orgName) {
        dispatch({
          type: "UPDATE_STATE",
          payload: {
            invitationInfo: {
              orgEntityId: router.query.orgEntityId as string,
              orgName:
                res.getOrgInvitationLink.properties.org.data.properties.name ||
                "",
              invitationLinkToken: router.query.invitationLinkToken as string,
            },
          },
        });
      }
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
    // If the user is logged in, and their account sign-up is complete...
    // ...redirect them to the homepage
    //  @todo this interferes with users that signup with normal flow and want to create an org
    // if (
    //   user?.accountSignupComplete
    // ) {
    //   void router.push(`/${user.accountId}`);
    // }
  }, [user, router, accountUsageType]);

  useEffect(() => {
    const { pathname, query } = router;
    // handles when user clicks on the verification link sent to their email
    if (pathname === "/signup" && isParsedAuthQuery(query) && router.isReady) {
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
      ...(responsibility && { usingHow: WayToUseHash.WithATeam }),
    });

    /** join organization once update user details has been completed  */
    if (responsibility && invitationInfo) {
      void joinOrg({
        variables: {
          orgEntityId: invitationInfo.orgEntityId as string,
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
      loading={
        getOrgInvitationLoading ||
        getOrgEmailInvitationLoading ||
        createUserWithOrgEmailInviteLoading
      }
      {...(activeScreen === Screen.OrgInvite && {
        onClose: navigateToHome,
      })}
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
      {activeScreen === Screen.OrgInvite && (
        <OrgInviteScreen
          createOrgInfo={createOrgInfo}
          navigateToHome={navigateToHome}
        />
      )}
    </AuthLayout>
  );
};

export default SignupPage;
