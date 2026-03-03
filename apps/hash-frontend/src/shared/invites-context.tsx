import { useQuery } from "@apollo/client";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";

import type {
  GetMyPendingInvitationsQuery,
  GetMyPendingInvitationsQueryVariables,
  PendingOrgInvitation,
} from "../graphql/api-types.gen";
import { getMyPendingInvitationsQuery } from "../graphql/queries/knowledge/org.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { usePollInterval } from "./use-poll-interval";

export type InvitesContextValues = {
  pendingInvites: PendingOrgInvitation[];
  loading: boolean;
  refetch: () => void;
};

export const InvitesContext = createContext<null | InvitesContextValues>(null);

export const useInvites = () => {
  const invitesContext = useContext(InvitesContext);

  if (!invitesContext) {
    throw new Error("Invites context missing");
  }

  return invitesContext;
};

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
