import React, { useEffect, useRef, useReducer } from "react";
import { useRouter } from "next/router";
import { useMutation } from "@apollo/client";
import { useUser } from "../components/hooks/useUser";

import { SignupIntro } from "./signup.page/signup-intro";
import { VerifyCode } from "./shared/verify-code";
import { AccountSetup } from "./signup.page/account-setup";
import { AccountUsage } from "./signup.page/account-usage";
import { OrgCreate } from "./signup.page/org-create";
import { OrgInvite } from "./signup.page/org-invite";

import {
  CreateUserMutation,
  CreateUserMutationVariables,
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
import { joinOrg as joinOrgMutation } from "../graphql/queries/org.queries";
import {
  isParsedAuthQuery,
  SYNTHETIC_LOADING_TIME_MS,
  Action,
  InvitationInfo,
  parseGraphQLError,
} from "./shared/auth-utils";
import { AuthLayout } from "./shared/auth-layout";
import { useGetInvitationInfo } from "./shared/use-get-invitation-info";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";

enum Screen {
  IntroScreen,
  VerifyCodeScreen,
  AccountSetupScreen,
  AccountUsageScreen,
  OrgCreateScreen,
  OrgInviteScreen,
}

type State = {
  activeScreen: Screen;
  email: string;
  verificationCodeMetadata: VerificationCodeMetadata | undefined;
  verificationCode: string;
  errorMessage: string;
  syntheticLoading: boolean;
  invitationInfo: InvitationInfo | null;
  createOrgInfo?: {
    invitationLinkToken: string;
    orgEntityId: string;
  };
};

type Actions =
  | Action<"CREATE_USER_SUCCESS", Pick<State, "verificationCodeMetadata">>
  | Action<"VERIFY_EMAIL_SUCCESS">
  | Action<"SET_ERROR", string>
  | Action<"UPDATE_STATE", Partial<State>>
  | Action<"CREATE_ORG_SUCCESS", Pick<State, "createOrgInfo">>;

const initialState: State = {
  activeScreen: Screen.IntroScreen,
  email: "",
  verificationCodeMetadata: undefined,
  verificationCode: "",
  errorMessage: "",
  syntheticLoading: false,
  invitationInfo: null,
};

function reducer(state: State, action: Actions): State {
  switch (action.type) {
    case "CREATE_USER_SUCCESS":
      return {
        ...state,
        ...action.payload,
        activeScreen: Screen.VerifyCodeScreen,
        errorMessage: "",
      };
    case "VERIFY_EMAIL_SUCCESS":
      return {
        ...state,
        activeScreen: Screen.AccountSetupScreen,
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
        activeScreen: Screen.OrgInviteScreen,
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

const Page: NextPageWithLayout = () => {
  const { user, refetch: refetchUser } = useUser();
  const router = useRouter();
  const [
    {
      activeScreen,
      email,
      verificationCode,
      verificationCodeMetadata,
      errorMessage,
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
      if (!graphQLErrors.length) return;

      const { errorCode, message } = parseGraphQLError(
        [...graphQLErrors],
        "ALREADY_EXISTS",
      );

      if (errorCode === "ALREADY_EXISTS") {
        void router.push({ pathname: "/login", query: { email } });
        return;
      }

      dispatch({
        type: "SET_ERROR",
        payload: message,
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
          ({ primary, verified }) => primary && verified,
        );

      dispatch({
        type: "UPDATE_STATE",
        payload: {
          activeScreen: Screen.AccountSetupScreen,
          email: createdEmail?.address,
        },
      });
    },
    onError: ({ graphQLErrors }) => {
      if (!graphQLErrors.length) return;

      const { errorCode, message } = parseGraphQLError(
        [...graphQLErrors],
        "ALREADY_EXISTS",
      );

      if (errorCode === "ALREADY_EXISTS") {
        void router.push({ pathname: "/login", query: router.query });
        return;
      }

      dispatch({
        type: "SET_ERROR",
        payload: message,
      });
    },
  });

  const [verifyEmail, { loading: verifyEmailLoading }] = useMutation<
    VerifyEmailMutation,
    VerifyEmailMutationVariables
  >(verifyEmailMutation, {
    onCompleted: async (_) => {
      await refetchUser();
      dispatch({
        type: "VERIFY_EMAIL_SUCCESS",
      });
    },
    onError: ({ graphQLErrors }) => {
      if (!graphQLErrors.length) return;

      const { message } = parseGraphQLError([...graphQLErrors]);

      dispatch({
        type: "SET_ERROR",
        payload: message,
      });
    },
  });

  const [updateUser, { loading: updateUserLoading }] = useMutation<
    UpdateUserMutation,
    UpdateUserMutationVariables
  >(updateUserMutation, {
    onCompleted: async (res) => {
      // For normal flow, accountUsageType is null. Direct user to accountUsage setup
      await refetchUser();

      if (res.updateUser.accountSignupComplete) {
        // If this mutation was called during the invite flow, do nothing
        // Next steps (redirecting to homepage ) is handled in `joinOrg`'s onCompleted
        if (invitationInfo) {
          return;
        }

        // If this mutation was called in normal flow, and user hasn't
        // set how they are using HASH, render AccountUsage screen
        if (!accountUsageType.current) {
          updateState({
            activeScreen: Screen.AccountUsageScreen,
            errorMessage: "",
          });
          return;
        }

        // If the mutation was called in the normal flow, and the user
        // is using HASH with a team, render OrgCreate screen
        if (accountUsageType.current === WayToUseHash.WithATeam) {
          updateState({
            activeScreen: Screen.OrgCreateScreen,
            errorMessage: "",
          });
          return;
        }

        void router.push(`/${res.updateUser.accountId}`);
      }
    },
    onError: ({ graphQLErrors }) => {
      if (!graphQLErrors.length) return;
      const { message } = parseGraphQLError([...graphQLErrors]);
      dispatch({
        type: "SET_ERROR",
        payload: message,
      });
    },
  });

  const [joinOrg, { loading: joinOrgLoading }] = useMutation<
    JoinOrgMutation,
    JoinOrgMutationVariables
  >(joinOrgMutation, {
    onCompleted: (_) => {
      void router.push("/");
    },
    onError: ({ graphQLErrors }) => {
      if (!graphQLErrors.length) return;
      const { message } = parseGraphQLError([...graphQLErrors]);

      dispatch({
        type: "SET_ERROR",
        payload: message,
      });
    },
  });

  useEffect(() => {
    const { pathname, query } = router;

    if (!router.isReady || pathname !== "/signup") return;

    // handles when user clicks on the verification link sent to their email
    if (isParsedAuthQuery(query)) {
      updateState({
        activeScreen: Screen.VerifyCodeScreen,
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

    if ("invitationEmailToken" in invitationInfo) {
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

  const handleVerifyEmail = (
    providedCode: string,
    withSyntheticLoading?: boolean,
  ) => {
    if (!verificationCodeMetadata) return;

    const verificationId = verificationCodeMetadata.id;

    if (withSyntheticLoading) {
      updateState({ syntheticLoading: true });
      setTimeout(() => {
        void verifyEmail({
          variables: { verificationId, verificationCode: providedCode },
        });
      }, SYNTHETIC_LOADING_TIME_MS);
    } else {
      void verifyEmail({
        variables: { verificationId, verificationCode: providedCode },
      });
    }
  };

  const updateUserDetails = (updatedProperties: UpdateUserProperties) => {
    if (!user) {
      dispatch({
        type: "SET_ERROR",
        payload: "The user must be logged in to update themselves",
      });
      return;
    }

    return updateUser({
      variables: {
        userEntityId: user.entityId,
        properties: updatedProperties,
      },
    });
  };

  const updateWayToUseHash = (usingHow: WayToUseHash) => {
    accountUsageType.current = usingHow;
    void updateUserDetails({
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

    if (user && responsibility && invitationInfo) {
      void joinOrg({
        variables: {
          orgEntityId: invitationInfo.orgEntityId,
          verification: {
            ...("invitationEmailToken" in invitationInfo && {
              invitationEmailToken: invitationInfo.invitationEmailToken,
            }),
            ...("invitationLinkToken" in invitationInfo && {
              invitationLinkToken: invitationInfo.invitationLinkToken,
            }),
          },
          responsibility,
        },
      });
    }
  };

  const navigateToHome = () => {
    void router.push(user ? `/${user.accountId}` : "/");
  };

  // handles when the user is logged in but hasn't finished setting up his account
  if (
    user &&
    !user.accountSignupComplete &&
    activeScreen !== Screen.AccountSetupScreen
  ) {
    updateState({
      activeScreen: Screen.AccountSetupScreen,
    });
  }

  return (
    <AuthLayout
      showTopLogo={[
        Screen.AccountUsageScreen,
        Screen.OrgCreateScreen,
        Screen.OrgInviteScreen,
      ].includes(activeScreen)}
      loading={invitationInfoLoading || createUserWithOrgEmailInviteLoading}
    >
      {activeScreen === Screen.IntroScreen && (
        <SignupIntro
          loading={createUserLoading}
          errorMessage={errorMessage}
          handleSubmit={requestVerificationCode}
          invitationInfo={invitationInfo}
        />
      )}
      {activeScreen === Screen.VerifyCodeScreen && (
        <VerifyCode
          loginIdentifier={email}
          goBack={() => updateState({ activeScreen: Screen.IntroScreen })}
          defaultCode={verificationCode}
          loading={verifyEmailLoading || syntheticLoading}
          handleSubmit={handleVerifyEmail}
          errorMessage={errorMessage}
          requestCodeLoading={createUserLoading}
          requestCode={() => {
            requestVerificationCode(email);
          }}
          invitationInfo={invitationInfo}
        />
      )}
      {activeScreen === Screen.AccountSetupScreen && (
        <AccountSetup
          onSubmit={handleAccountSetup}
          loading={updateUserLoading || joinOrgLoading}
          errorMessage={errorMessage}
          email={email}
          invitationInfo={invitationInfo}
        />
      )}
      {activeScreen === Screen.AccountUsageScreen && (
        <AccountUsage
          updateWayToUseHash={updateWayToUseHash}
          loading={updateUserLoading}
          errorMessage={errorMessage}
        />
      )}
      {activeScreen === Screen.OrgCreateScreen && user?.accountId && (
        <OrgCreate
          // accountId={user.accountId}
          onCreateOrgSuccess={(data: {
            invitationLinkToken: string;
            orgEntityId: string;
          }) => {
            dispatch({
              type: "CREATE_ORG_SUCCESS",
              payload: {
                createOrgInfo: data,
              },
            });
          }}
        />
      )}
      {activeScreen === Screen.OrgInviteScreen && createOrgInfo && (
        <OrgInvite
          createOrgInfo={createOrgInfo}
          navigateToHome={navigateToHome}
        />
      )}
    </AuthLayout>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
