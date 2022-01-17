import { ApolloError } from "apollo-server-errors";
import { OrgEmailInvitation } from "../../../model";
import {
  Resolver,
  OrgEmailInvitation as GQLOrgEmailInvitation,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";

const notFoundMsg = (entityId: string, accountId: string) =>
  `OrgEmailInvitation with entityId ${entityId} in account ${accountId} not found in datastore`;

const org: Resolver<
  Promise<UnresolvedGQLEntity>,
  GQLOrgEmailInvitation,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const orgEmailInvitation = await OrgEmailInvitation.getOrgEmailInvitation(
    dataSources.db,
    { accountId, entityId },
  );

  if (!orgEmailInvitation) {
    throw new ApolloError(notFoundMsg(entityId, accountId), "NOT_FOUND");
  }

  const orgEmailInvitationOrg = await orgEmailInvitation.getOrg(dataSources.db);

  return orgEmailInvitationOrg.toGQLUnknownEntity();
};

const inviter: Resolver<
  Promise<UnresolvedGQLEntity>,
  GQLOrgEmailInvitation,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const orgEmailInvitation = await OrgEmailInvitation.getOrgEmailInvitation(
    dataSources.db,
    { accountId, entityId },
  );

  if (!orgEmailInvitation) {
    throw new ApolloError(notFoundMsg(entityId, accountId), "NOT_FOUND");
  }

  const orgEmailInvitationInviter = await orgEmailInvitation.getInviter(
    dataSources.db,
  );

  return orgEmailInvitationInviter.toGQLUnknownEntity();
};

export const orgEmailInvitationLinkedEntities = {
  org,
  inviter,
};
