import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getMyPendingInvitationsQuery } from "../graphql/queries/knowledge/org.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { InvitesContext, type InvitesContextValues } from "./invites-context";
import { usePollInterval } from "./use-poll-interval";

import type {
  GetMyPendingInvitationsQuery,
  GetMyPendingInvitationsQueryVariables,
} from "../graphql/api-types.gen";
import type { FunctionComponent, PropsWithChildren } from "react";

export const InvitesContextProvider: FunctionComponent<PropsWithChildren> = ({
  children,
}) => {
  const { authenticatedUser } = useAuthInfo();

  const pollInterval = usePollInterval();

  const {
    data: invitesData,
    loading: loadingInvites,
    refetch,
  } = useQuery<
    GetMyPendingInvitationsQuery,
    GetMyPendingInvitationsQueryVariables
  >(getMyPendingInvitationsQuery, {
    pollInterval,
    skip: !authenticatedUser?.accountSignupComplete,
    fetchPolicy: "network-only",
  });

  const value = useMemo<InvitesContextValues>(
    () => ({
      loading: loadingInvites,
      pendingInvites: invitesData?.getMyPendingInvitations ?? [],
      refetch,
    }),
    [loadingInvites, invitesData, refetch],
  );

  return (
    <InvitesContext.Provider value={value}>{children}</InvitesContext.Provider>
  );
};
