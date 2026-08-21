import { createContext, useContext } from "react";

import type { PendingOrgInvitation } from "../graphql/api-types.gen";

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
