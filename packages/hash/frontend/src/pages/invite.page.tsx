import { NextPage } from "next";
import { tw } from "twind";
import { useRouter } from "next/router";
import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "../components/hooks/useUser";

import { AuthLayout } from "../components/layout/PageLayout/AuthLayout";

import Logo from "../assets/svg/logo.svg";
import { IconSpinner } from "../components/Icons/IconSpinner";
import { SelectInput } from "../components/forms/SelectInput";
import {
  GetOrgEmailInvitationQuery,
  GetOrgEmailInvitationQueryVariables,
  GetOrgInvitationLinkQuery,
  GetOrgInvitationLinkQueryVariables,
  JoinOrgMutation,
  JoinOrgMutationVariables,
} from "../graphql/apiTypes.gen";
import {
  joinOrg as joinOrgMutation,
  getOrgEmailInvitation,
  getOrgInvitationLink,
} from "../graphql/queries/org.queries";
import {
  INVITE_ERROR_CODES,
  isParsedInvitationEmailQuery,
  isParsedInvitationLinkQuery,
  ORG_ROLES,
} from "../components/pages/auth/utils";

type InvitationInfo = {
  orgName: string;
  inviter?: string;
  mode: "email" | "general";
};

// @todo: show success message before navigating to home page
// @todo add error component for invalid links

const InvitePage: NextPage = () => {
  const { user, loading: fetchingUser } = useUser();
  const router = useRouter();
  const {
    orgEntityId,
    invitationEmailToken,
    invitationLinkToken,
    isExistingUser,
  } = router.query;
  const [responsibility, setResponsibility] = useState(ORG_ROLES[0].value);
  const [errorMessage, setErrorMessage] = useState("");
  const [invitationInfo, setInvitationInfo] = useState<
    InvitationInfo | undefined
  >();

  useEffect(() => {
    if (typeof window === "undefined" || !router.isReady) {
      return;
    }

    /**
     * Redirect to home page if necessary query params aren't available
     */
    if (
      !isParsedInvitationLinkQuery(router.query) &&
      !isParsedInvitationEmailQuery
    ) {
      void router.push("/");
      return;
    }

    /**
     *  handle redirects when user isn't authenticated
     * */
    if (!user && !fetchingUser) {
      void router.push({
        pathname: isExistingUser ? "/login" : "/signup",
        query: router.query,
      });
    }
  }, [router, user, fetchingUser]);

  const navigateToHome = () => {
    void router.push("/");
  };

  // @todo merge both into a hook
  const { loading: getOrgEmailInvitationLoading } = useQuery<
    GetOrgEmailInvitationQuery,
    GetOrgEmailInvitationQueryVariables
  >(getOrgEmailInvitation, {
    variables: {
      orgEntityId: orgEntityId as string,
      invitationEmailToken: invitationEmailToken as string,
    },
    skip: !orgEntityId || !invitationEmailToken || !user,
    onCompleted: (res) => {
      const orgName =
        res.getOrgEmailInvitation.properties.org.data.properties.name;
      const inviter =
        res.getOrgEmailInvitation.properties.inviter.data.properties
          .preferredName;
      if (orgName && inviter) {
        setInvitationInfo({
          inviter,
          orgName,
          mode: "email",
        });
      }
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ message }) => {
        // const { code } = extensions as {
        //   code?: keyof typeof INVITE_ERROR_CODES;
        // };
        setErrorMessage(message);
      });
    },
  });

  const { loading: getOrgInvitationLoading } = useQuery<
    GetOrgInvitationLinkQuery,
    GetOrgInvitationLinkQueryVariables
  >(getOrgInvitationLink, {
    variables: {
      orgEntityId: orgEntityId as string,
      invitationLinkToken: invitationLinkToken as string,
    },
    skip: !orgEntityId || !invitationLinkToken || !user,
    onCompleted: (res) => {
      const orgName =
        res.getOrgInvitationLink.properties.org.data.properties.name;
      if (orgName) {
        setInvitationInfo({
          orgName,
          mode: "general",
        });
      }
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ message }) => {
        // const { code } = extensions as {
        //   code?: keyof typeof INVITE_ERROR_CODES;
        // };
        setErrorMessage(message);
      });
    },
  });

  const [joinOrg, { loading: joinOrgLoading }] = useMutation<
    JoinOrgMutation,
    JoinOrgMutationVariables
  >(joinOrgMutation, {
    onCompleted: (_) => {
      navigateToHome();
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as {
          code?: keyof typeof INVITE_ERROR_CODES;
        };
        if (code === "ALREADY_USED") {
          void router.push("/");
        } else {
          setErrorMessage(message);
        }
      });
    },
  });

  const handleSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    setErrorMessage("");
    void joinOrg({
      variables: {
        orgEntityId: orgEntityId as string,
        verification: {
          ...(invitationEmailToken && {
            invitationEmailToken: invitationEmailToken as string,
          }),
          ...(invitationLinkToken && {
            invitationLinkToken: invitationLinkToken as string,
          }),
        },
        responsibility,
      },
    });
  };

  const [title, subtitle] = useMemo(() => {
    if (invitationInfo?.mode === "email") {
      return [
        `${invitationInfo.inviter} has invited you to join ${invitationInfo.orgName} on HASH`,
        `Now it's time to select your role at ${invitationInfo.orgName}`,
      ];
    }
    if (invitationInfo?.mode === "general") {
      return [
        `You have been invited to join ${invitationInfo.orgName} on HASH`,
        `Now it's time to select your role at ${invitationInfo.orgName}`,
      ];
    }
    return ["", ""];
  }, [invitationInfo]);

  return (
    <AuthLayout
      loading={getOrgInvitationLoading || getOrgEmailInvitationLoading}
      onClose={navigateToHome}
    >
      <div className={tw`w-9/12 max-w-3xl`}>
        <Logo className={tw`mb-16`} />
        <div className={tw`mb-9`}>
          <h1 className={tw`text-3xl font-bold mb-4`}>{title}</h1>
          <p className={tw`text-2xl mb-14 font-light`}>{subtitle}</p>

          <form onSubmit={handleSubmit}>
            <div className={tw`mb-6`}>
              <SelectInput
                id="responsibility"
                label={`Your role at ${invitationInfo?.orgName}`}
                options={ORG_ROLES}
                onChangeValue={setResponsibility}
              />
              {errorMessage ? (
                <p className={tw`text-red-500 text-sm mt-5 `}>{errorMessage}</p>
              ) : null}
            </div>

            <button
              type="submit"
              className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 focus:outline-none rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold`}
              disabled={joinOrgLoading}
            >
              {joinOrgLoading ? (
                <IconSpinner className={tw`h-4 w-4 text-white animate-spin`} />
              ) : (
                <>
                  <span>Continue</span>
                  <span
                    className={tw`ml-2 transition-all group-hover:translate-x-1`}
                  >
                    &rarr;
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </AuthLayout>
  );
};

export default InvitePage;
