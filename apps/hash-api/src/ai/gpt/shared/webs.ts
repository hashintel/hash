import { AccountId } from "@local/hash-subgraph";

import { ImpureGraphContext } from "../../../graph/context-types";
import { getOrgMembershipOrg } from "../../../graph/knowledge/system-types/org-membership";
import {
  getUserOrgMemberships,
  User,
} from "../../../graph/knowledge/system-types/user";

export type SimpleWeb = {
  uuid: string;
  name: string;
  type: "User" | "Organization";
};

export const getUserSimpleWebs = async (
  context: ImpureGraphContext,
  authentication: { actorId: AccountId },
  { user }: { user: User },
): Promise<SimpleWeb[]> => {
  if (!user.shortname) {
    throw new Error("User has not completed signup");
  }

  const orgMemberships = await getUserOrgMemberships(context, authentication, {
    userEntityId: user.entity.metadata.recordId.entityId,
  });

  const orgs = await Promise.all(
    orgMemberships.map((orgMembership) =>
      getOrgMembershipOrg(context, authentication, {
        orgMembership,
      }),
    ),
  );

  return [
    {
      type: "User",
      name: user.shortname,
      uuid: user.accountId,
    },
    ...orgs.map((org) => ({
      type: "Organization" as const,
      name: org.shortname,
      uuid: org.accountGroupId,
    })),
  ];
};
