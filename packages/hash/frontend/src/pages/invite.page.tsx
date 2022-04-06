import { tw } from "twind";
import { useRouter } from "next/router";
import { useMutation } from "@apollo/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../components/hooks/useUser";

import { AuthLayout } from "./shared/auth-layout";

import { SpinnerIcon, LogoIcon } from "../shared/icons";
import { SelectInput } from "../components/forms/SelectInput";
import {
  JoinOrgMutation,
  JoinOrgMutationVariables,
} from "../graphql/apiTypes.gen";
import { joinOrg as joinOrgMutation } from "../graphql/queries/org.queries";
import {
  isParsedInvitationEmailQuery,
  isParsedInvitationLinkQuery,
  ORG_ROLES,
  SYNTHETIC_LOADING_TIME_MS,
} from "../components/auth/utils";
import { useGetInvitationInfo } from "../components/hooks/useGetInvitationInfo";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";

// @todo add error component for invalid links
const Page: NextPageWithLayout = () => {
  const { user, loading: fetchingUser } = useUser();
  const router = useRouter();

  /** Ensures the loader shows up initially until all requests are complete */
  const [initialLoading, setInitialLoading] = useState(true);
  const [responsibility, setResponsibility] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState("");
  const { invitationInfo, invitationInfoLoading, invitationInfoError } =
    useGetInvitationInfo();

  const navigateToHome = useCallback(() => {
    void router.push("/");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined" || !router.isReady) {
      return;
    }

    setTimeout(() => {
      setInitialLoading(false);
    }, SYNTHETIC_LOADING_TIME_MS);
    /**
     * Redirect to home page if necessary query params aren't available
     */
    if (
      !isParsedInvitationLinkQuery(router.query) &&
      !isParsedInvitationEmailQuery(router.query)
    ) {
      navigateToHome();
    } else if (!user && !fetchingUser) {
      /**
       * handle redirects when user isn't authenticated
       */
      if (isParsedInvitationEmailQuery(router.query)) {
        const { isExistingUser, ...remainingQuery } = router.query;
        void router.push({
          pathname: isExistingUser ? "/login" : "/signup",
          query: remainingQuery,
        });
      } else {
        void router.push({
          pathname: "/login",
          query: router.query,
        });
      }
    }
  }, [router, user, fetchingUser, navigateToHome]);

  const [joinOrg, { loading: joinOrgLoading }] = useMutation<
    JoinOrgMutation,
    JoinOrgMutationVariables
  >(joinOrgMutation, {
    onCompleted: (_) => {
      navigateToHome();
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions, message }) => {
        if (extensions?.code === "ALREADY_USED") {
          navigateToHome();
        } else {
          setErrorMessage(message);
        }
      });
    },
  });

  const handleSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!responsibility || !invitationInfo) return;

    setErrorMessage("");
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
  };

  const [title, subtitle] = useMemo(() => {
    if (!invitationInfo) return ["", ""];
    if ("inviterPreferredName" in invitationInfo) {
      return [
        `${invitationInfo.inviterPreferredName} has invited you to join ${invitationInfo.orgName} on HASH`,
        `Now it's time to select your role at ${invitationInfo.orgName}`,
      ];
    } else {
      return [
        `You have been invited to join ${invitationInfo?.orgName} on HASH`,
        `Now it's time to select your role at ${invitationInfo.orgName}`,
      ];
    }
  }, [invitationInfo]);

  return (
    <AuthLayout loading={invitationInfoLoading || initialLoading}>
      <div className={tw`w-9/12 max-w-3xl`}>
        <LogoIcon className={tw`mb-16`} />
        <div className={tw`mb-9`}>
          <h1 className={tw`text-3xl font-bold mb-4`}>{title}</h1>
          <p className={tw`text-2xl mb-14 font-light`}>{subtitle}</p>

          <form onSubmit={handleSubmit}>
            <div className={tw`mb-6`}>
              <SelectInput
                className={tw`w-64`}
                id="responsibility"
                label={`Your role at ${invitationInfo?.orgName}`}
                options={ORG_ROLES}
                onChangeValue={setResponsibility}
                value={responsibility}
                placeholder="Current Position"
                required
              />
              {errorMessage || invitationInfoError ? (
                <p className={tw`text-red-500 text-sm mt-5 `}>
                  {errorMessage || invitationInfoError}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 focus:outline-none rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold`}
              disabled={joinOrgLoading || !responsibility}
            >
              {joinOrgLoading ? (
                <SpinnerIcon className={tw`h-4 w-4 text-white animate-spin`} />
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

Page.getLayout = getPlainLayout;

export default Page;
