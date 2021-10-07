import React, { useEffect, useRef, useReducer } from "react";
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

import { useMutation, useQuery } from "@apollo/client";
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
  orgEntityId: string | null;
  invitationLink?: string;
  invitationInfo: {
    orgName: string;
    orgEntityId: string;
    inviter?: string;
    invitationEmailToken?: string;
    invitationLinkToken?: string;
  } | null;
  signupMode: "normal" | "invite";
};

type Actions =
  | Action<"CREATE_USER_SUCCESS", Pick<State, "verificationCodeMetadata">>
  | Action<"VERIFY_EMAIL_SUCCESS", Pick<State, "userEntityId">>
  | Action<"SET_ERROR", string>
  | Action<"UPDATE_STATE", Partial<State>>;

const initialState: State = {
  activeScreen: Screen.VerifyCode,
  email: "",
  verificationCodeMetadata: undefined,
  verificationCode: "",
  errorMessage: "",
  userEntityId: null,
  syntheticLoading: false,
  orgEntityId: null,
  invitationInfo: null,
  signupMode: "normal",
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

/**
 * LEFT TODO
 * Error states for entire flow
 * hook to handle invitationLink and emailInvitationLink
 */

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
      invitationLink,
      invitationInfo,
      signupMode,
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
    onCompleted: ({ createUser }) => {
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
          signupMode: "normal",
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
    onCompleted: async ({ updateUser }) => {
      // for normal flow, accountUsageType is null. Direct user to accountUsage setup
      // @todo update user cache with updateUser data instead of refetching here
      await refetch();

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
      const accessToken =
        createOrg.properties.invitationLink?.data.properties.accessToken;
      const inviteQueryParams = new URLSearchParams({
        orgEntityId: createOrg.entityId,
        ...(accessToken ? { invitationLinkToken: accessToken } : {}),
      });
      updateState({
        orgEntityId: createOrg.accountId,
        invitationLink: `${window.location.origin}/invite?${inviteQueryParams}`,
        activeScreen: Screen.OrgInvite,
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
    onCompleted: ({ getOrgEmailInvitation }) => {
      const { invitationEmailToken, orgEntityId } = router.query;

      dispatch({
        type: "UPDATE_STATE",
        payload: {
          orgEntityId: orgEntityId as string,
          invitationInfo: {
            orgEntityId: orgEntityId as string,
            orgName:
              getOrgEmailInvitation.properties.org.data.properties.name || "",
            inviter:
              getOrgEmailInvitation.properties.inviter.data.properties
                .preferredName || "",
            invitationEmailToken: invitationEmailToken as string,
          },
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
      invitationLinkToken: router.query.invitationEmailToken as string,
    },
    skip: !(
      isParsedInviteQuery(router.query) && !!router.query.invitationLinkToken
    ),
    onCompleted: ({ getOrgInvitationLink }) => {
      const orgName = getOrgInvitationLink.properties.org.data.properties.name;

      if (orgName) {
        dispatch({
          type: "UPDATE_STATE",
          payload: {
            invitationInfo: {
              orgEntityId: router.query.orgEntityId as string,
              orgName:
                getOrgInvitationLink.properties.org.data.properties.name || "",
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
    onCompleted: ({ joinOrg }) => {
      // redirect to home page
      router.push("/");
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
      const { verificationId, verificationCode } = query;
      updateState({ activeScreen: Screen.VerifyCode, verificationCode });
      void verifyEmail({
        variables: {
          verificationId: query.verificationId,
          verificationCode: query.verificationCode,
        },
      });
      return;
    }

    // handles when user either opens an inviteLink or emailInviteLink
    if (
      pathname === "/signup" &&
      isParsedInviteQuery(query) &&
      router.isReady
    ) {
      createUserWithOrgEmailInvite({
        variables: {
          invitationEmailToken: query.invitationEmailToken as string,
          orgEntityId: query.orgEntityId as string,
        },
      });
    }
  }, [router, verifyEmail, createUserWithOrgEmailInvite]);

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

    // join organization once update user details has been completed
    if (responsibility) {
      joinOrg({
        variables: {
          orgEntityId,
          verification: {
            ...(invitationInfo?.invitationEmailToken && {
              invitationEmailToken: invitationInfo?.invitationEmailToken,
            }),
            ...(invitationInfo?.invitationLinkToken && {
              invitationLinkToken: invitationInfo?.invitationLinkToken,
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
    createOrg({
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
      loading={getOrgInvitationLoading || getOrgEmailInvitationLoading}
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
          invitationInfo={invitationInfo}
        />
      )}
      {activeScreen === Screen.AccountSetup && (
        <AccountSetup
          onSubmit={handleAccountSetup}
          loading={updateUserLoading}
          errorMessage={errorMessage}
          email={email}
          invitationInfo={invitationInfo}
        />
      )}
      {activeScreen == Screen.AccountUsage && (
        <AccountUsage
          updateWayToUseHash={updateWayToUseHash}
          loading={updateUserLoading}
          errorMessage={errorMessage}
        />
      )}
      {activeScreen == Screen.OrgCreate && (
        <OrgCreate
          createOrg={handleCreateOrganization}
          loading={createOrgLoading}
        />
      )}
      {activeScreen == Screen.OrgInvite && (
        <OrgInvite
          invitationLink={invitationLink}
          orgEntityId={orgEntityId}
          navigateToHome={() => {
            user && router.push(`/${user.accountId}`);
          }}
        />
      )}
    </AuthLayout>
  );
};

export default SignupPage;
