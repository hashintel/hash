import { useQuery } from "@apollo/client";
import { useRouter } from "next/router";
import { Suspense, useEffect } from "react";

import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";

import { hasAccessToHashQuery } from "../../graphql/queries/user.queries";
import { useAuthInfo } from "../shared/auth-info-context";
import { maintenanceRoute } from "../shared/maintenance";

import type { HasAccessToHashQuery } from "../../graphql/api-types.gen";
import type { User } from "../../lib/user-and-org";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import type { FunctionComponent, ReactNode } from "react";

type RouteAuthenticatedUser = Pick<
  User,
  "accountSignupComplete" | "emails" | "enabledFeatureFlags"
>;

type ClientRouteDecision =
  | { status: "allow" }
  | { status: "redirect"; destination: string }
  | { status: "waiting" };

const publiclyAccessiblePagePathnames = [
  "/[shortname]/[page-slug]",
  "/signin",
  "/signup",
  "/verification",
  "/recovery",
  "/",
];

const unverifiedUserPermittedPagePathnames = ["/verification", "/signup"];

const featureFlagHiddenPathnames: Record<FeatureFlag, string[]> = {
  pages: [],
  documents: [],
  canvases: [],
  notes: ["/notes"],
  workers: ["/goals", "/flows", "/workers", "/agents"],
  ai: ["/goals"],
  supplyChain: [],
  dashboards: ["/dashboards", "/dashboard/[dashboard-id]"],
};

export const getClientRouteDecision = (params: {
  aal2Required: boolean;
  asPath: string;
  authenticatedUser?: RouteAuthenticatedUser;
  emailVerificationStatusKnown: boolean;
  hasAccessToHash?: boolean;
  isInstanceAdmin: boolean;
  isInstanceAdminLoading: boolean;
  pathname: string;
}): ClientRouteDecision => {
  const {
    aal2Required,
    asPath,
    authenticatedUser,
    emailVerificationStatusKnown,
    hasAccessToHash,
    isInstanceAdmin,
    isInstanceAdminLoading,
    pathname,
  } = params;

  if (pathname === maintenanceRoute) {
    return { status: "allow" };
  }

  if (!authenticatedUser) {
    if (publiclyAccessiblePagePathnames.includes(pathname)) {
      return { status: "allow" };
    }

    const returnTo = ["", "/", "/404"].includes(pathname)
      ? ""
      : `?return_to=${encodeURIComponent(asPath)}`;

    return { status: "redirect", destination: `/signin${returnTo}` };
  }

  if (!emailVerificationStatusKnown && !aal2Required) {
    return { status: "waiting" };
  }

  const primaryEmailVerified =
    authenticatedUser.emails.find(({ primary }) => primary)?.verified ?? false;

  if (
    emailVerificationStatusKnown &&
    !primaryEmailVerified &&
    !unverifiedUserPermittedPagePathnames.includes(pathname)
  ) {
    return { status: "redirect", destination: "/verification" };
  }

  if (
    emailVerificationStatusKnown &&
    primaryEmailVerified &&
    pathname === "/verification"
  ) {
    return { status: "redirect", destination: "/" };
  }

  if (!authenticatedUser.accountSignupComplete) {
    if (hasAccessToHash === undefined) {
      return { status: "waiting" };
    }

    if (hasAccessToHash && !pathname.startsWith("/signup")) {
      return { status: "redirect", destination: "/signup" };
    }

    if (!hasAccessToHash && pathname !== "/") {
      return { status: "redirect", destination: "/" };
    }
  } else if (
    pathname === "/signup" &&
    !asPath.includes("invitationId=")
  ) {
    return { status: "redirect", destination: "/" };
  }

  for (const featureFlag of featureFlags) {
    if (
      !authenticatedUser.enabledFeatureFlags.includes(featureFlag) &&
      featureFlagHiddenPathnames[featureFlag].includes(pathname)
    ) {
      if (isInstanceAdminLoading) {
        return { status: "waiting" };
      }

      if (!isInstanceAdmin) {
        return { status: "redirect", destination: "/" };
      }
    }
  }

  return { status: "allow" };
};

export const ClientRouteGuard: FunctionComponent<{ children: ReactNode }> = ({
  children,
}) => {
  const router = useRouter();
  const {
    aal2Required,
    authenticatedUser,
    emailVerificationStatusKnown,
    isAuthInfoLoading,
    isInstanceAdmin: maybeIsInstanceAdmin,
    isInstanceAdminLoading,
  } = useAuthInfo();

  const {
    data: hasAccessToHashResponse,
    error: hasAccessToHashError,
  } = useQuery<HasAccessToHashQuery>(hasAccessToHashQuery, {
    skip: !authenticatedUser || authenticatedUser.accountSignupComplete,
  });

  const hasAccessToHash = authenticatedUser?.accountSignupComplete
    ? true
    : hasAccessToHashError
      ? false
      : hasAccessToHashResponse?.hasAccessToHash;

  const decision = getClientRouteDecision({
    aal2Required,
    asPath: router.asPath,
    authenticatedUser,
    emailVerificationStatusKnown,
    hasAccessToHash,
    isInstanceAdmin: maybeIsInstanceAdmin ?? false,
    isInstanceAdminLoading,
    pathname: router.pathname,
  });

  const redirectDestination =
    decision.status === "redirect" && decision.destination !== router.asPath
      ? decision.destination
      : undefined;

  useEffect(() => {
    if (redirectDestination) {
      void router.replace(redirectDestination);
    }
  }, [redirectDestination, router]);

  if (
    isAuthInfoLoading ||
    !router.isReady ||
    decision.status === "waiting" ||
    redirectDestination
  ) {
    return <Suspense />;
  }

  return children;
};
