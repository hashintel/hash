import { Org as GQLOrg, Visibility } from "../../apiTypes.gen";
import { OrgModel } from "../../../model";

type GQLOrgExternalResolvers =
  | "emailInvitations"
  | "invitationLinks"
  | "memberships"
  | "memberOf"
  | "entityType"
  | "linkGroups"
  | "linkedEntities"
  | "linkedAggregations";

export type UnresolvedGQLOrg = Omit<GQLOrg, GQLOrgExternalResolvers>;

/** @todo: address the below todos as part of https://app.asana.com/0/0/1202996188015542/f */
export const mapOrgModelToGQL = async (
  org: OrgModel,
): Promise<UnresolvedGQLOrg> => {
  return {
    accountId: org.entityId,
    id: org.entityId,
    entityId: org.entityId,
    entityVersionId: org.version,
    entityTypeId: "" /** @todo: deprecate this field */,
    entityTypeVersionId: org.entityTypeModel.schema.$id,
    entityTypeName: org.entityTypeModel.schema.title,
    shortname: org.getShortname(),
    name: org.getOrgName(),
    entityVersionCreatedAt:
      new Date().toISOString() /** @todo: stop hardcoding this */,
    createdAt: new Date().toISOString() /** @todo: stop hardcoding this */,
    updatedAt: new Date().toISOString() /** @todo: stop hardcoding this */,
    createdByAccountId: "" /** @todo: stop hardcoding this */,
    visibility:
      Visibility.Public /** @todo: potentially deprecate or stop hardcoding this */,
  };
};
