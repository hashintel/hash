import { ApolloError } from "apollo-server-errors";
import { OrgInvitationLink } from "../../../model";
import {
  Resolver,
  OrgInvitationLink as GQLOrgInvitationLink,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";

const notFoundMsg = (entityId: string, accountId: string) =>
  `OrgInvitationLink with entityId ${entityId} in account ${accountId} not found in datastore`;

const org: Resolver<
  Promise<UnresolvedGQLEntity>,
  GQLOrgInvitationLink,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const orgInvitationLink = await OrgInvitationLink.getOrgInvitationLink(
    dataSources.db,
    { accountId, entityId },
  );

  if (!orgInvitationLink) {
    throw new ApolloError(notFoundMsg(entityId, accountId), "NOT_FOUND");
  }

  const orgInvitationLinkOrg = await orgInvitationLink.getOrg(dataSources.db);

  return orgInvitationLinkOrg.toGQLUnknownEntity();
};

export const orgInvitationLinkLinkedEntities = {
  org,
};
