import { NextPage } from "next";
import { tw } from "twind";
import { useUser } from "../components/hooks/useUser";

import { AuthLayout } from "../components/layout/PageLayout/AuthLayout";

import Logo from "../assets/svg/logo.svg";
import { IconSpinner } from "../components/Icons/IconSpinner";
import { SelectInput } from "../components/forms/SelectInput";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { useQuery } from "@apollo/client";
import {
  GetOrgEmailInvitationQuery,
  GetOrgEmailInvitationQueryVariables,
} from "../graphql/apiTypes.gen";
import { getOrgEmailInvitation } from "../graphql/queries/orgEmailInvitation.queries";
import { useEffect, useMemo } from "react";

// @todo make this reusable
const ROLES = [
  { label: "Marketing", value: "Marketing" },
  { label: "Sales", value: "Sales" },
  { label: "Operations", value: "Operations" },
  { label: "Customer Success", value: "Customer Success" },
  { label: "Design", value: "Design" },
  { label: "Engineering", value: "Engineering" },
  { label: "Product", value: "Product" },
  { label: "IT", value: "IT" },
  { label: "HR", value: "HR" },
  { label: "Cross-Functional", value: "Cross-Functional" },
];

const InvitePage: NextPage = () => {
  const { user, loading: fetchingUser } = useUser();
  const router = useRouter();
  const { register } = useForm();
  const { orgEntityId, invitationEmailToken, isExistingUser } = router.query;

  const handleSubmit = () => {};
  const errorMessage = "";

  const { data, loading, error } = useQuery<
    GetOrgEmailInvitationQuery,
    GetOrgEmailInvitationQueryVariables
  >(getOrgEmailInvitation, {
    variables: {
      orgEntityId: orgEntityId as string,
      invitationEmailToken: invitationEmailToken as string,
    },
    skip: !orgEntityId || !invitationEmailToken || !user,
  });

  useEffect(() => {
    if (typeof window == "undefined") {
      return;
    }

    /**
     * Redirect to home page is necessary query params aren't available
     */
    if ((!orgEntityId || !invitationEmailToken) && router.isReady) {
      router.push("/");
      return;
    }

    /**
     *  handle redirects when user isn't authenticated
     * */
    if (!user && !fetchingUser) {
      if (isExistingUser) {
        router.push({ pathname: "/login", query: router.query });
      } else {
        router.push({ pathname: "/signup", query: router.query });
      }
    }
  }, [router, user, fetchingUser]);

  const inviterShortname = useMemo(() => {
    if (!data) return "";
    return data.getOrgEmailInvitation?.properties.inviter.data.properties
      .preferredName;
  }, [data]);

  const orgShortname = useMemo(() => {
    if (!data) return "";
    return data.getOrgEmailInvitation?.properties.org.data.properties.shortname;
  }, [data]);

  console.log("data ==> ", data);

  return (
    <AuthLayout>
      <div className={tw`w-9/12 max-w-3xl`}>
        <Logo className={tw`mb-16`} />
        <div className={tw`mb-9`}>
          <h1 className={tw`text-3xl font-bold mb-4`}>
            {inviterShortname} has invited you to join {orgShortname} on HASH
          </h1>
          <p className={tw`text-2xl mb-14 font-light`}>
            Now it's time to select your role at {orgShortname}
          </p>

          <form onSubmit={handleSubmit}>
            <div className={tw`mb-6`}>
              <SelectInput
                label={`Your role at ${orgShortname}`}
                options={ROLES}
              />
              {errorMessage ? (
                <p className={tw`text-red-500 text-sm mt-5 `}>{errorMessage}</p>
              ) : null}
            </div>

            <button
              className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold`}
              disabled={false}
            >
              {false ? (
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
