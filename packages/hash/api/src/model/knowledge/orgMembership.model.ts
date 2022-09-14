import { GraphApi } from "../../graph";
import {
  OrgMembershipModel,
  EntityModel,
  EntityModelCreateParams,
  EntityTypeModel,
} from "..";
import { workspaceAccountId } from "../util";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

export type OrgMembershipModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  role: string;
};

/**
 * @class {@link OrgMembershipModel}
 */
export default class extends EntityModel {
  /**
   * Create a workspace OrgMembership entity.
   *
   * @param params.role - the role of the user at the organization
   */
  static async createOrgMembership(
    graphApi: GraphApi,
    params: OrgMembershipModelCreateParams,
  ) {
    const { role } = params;

    const properties: object = {
      [WORKSPACE_TYPES.propertyType.role.baseUri]: role,
    };

    const entityTypeModel = WORKSPACE_TYPES.entityType.orgMembership;

    const { entityId, version } = await EntityModel.create(graphApi, {
      accountId: workspaceAccountId,
      properties,
      entityTypeModel,
    });

    return new OrgMembershipModel({
      accountId: workspaceAccountId,
      entityId,
      version,
      entityTypeModel,
      properties,
    });
  }

  /**
   * Get the system OrgMembership entity type.
   */
  static async getOrgMembershipEntityType(graphApi: GraphApi) {
    const versionedUri = WORKSPACE_TYPES.entityType.orgMembership.schema.$id;

    return await EntityTypeModel.get(graphApi, {
      versionedUri,
    });
  }
}
