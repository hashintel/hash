import { Resolver, User as GQLUser, Visibility } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { UserModel } from "../../../model";
import { GraphApi } from "../../../graph";

type GQLUserExternalResolvers =
  | "accountSignupComplete"
  | "memberOf"
  | "entityType"
  | "linkGroups"
  | "linkedEntities"
  | "linkedAggregations";

type UnresolvedGQLUser = Omit<GQLUser, GQLUserExternalResolvers>;

const mapUserModelToGQL = async (
  _graphApi: GraphApi,
  user: UserModel,
): Promise<UnresolvedGQLUser> => {
  return {
    accountId: user.accountId,
    id: user.entityId,
    entityId: user.entityId,
    entityVersionId: user.version,
    entityTypeId: "" /** @todo: deprecate this field */,
    entityTypeVersionId: user.entityTypeModel.schema.$id,
    entityTypeName: user.entityTypeModel.schema.title,
    properties: {
      shortname: user.getShortname(),
      preferredName: user.getPreferredName(),
      emails: await user.getQualifiedEmails(),
    },
    entityVersionCreatedAt:
      new Date().toISOString() /** @todo: stop hardcoding this */,
    createdAt: new Date().toISOString() /** @todo: stop hardcoding this */,
    updatedAt: new Date().toISOString() /** @todo: stop hardcoding this */,
    createdByAccountId: "" /** @todo: stop hardcoding this */,
    visibility:
      Visibility.Public /** @todo: potentially deprecate or stop hardcoding this */,
    metadataId: "" /** @todo: deprecate this */,
  };
};

export const me: Resolver<
  UnresolvedGQLUser,
  {},
  LoggedInGraphQLContext
> = async (_, __, { user, dataSources: { graphApi } }) =>
  mapUserModelToGQL(graphApi, user);
