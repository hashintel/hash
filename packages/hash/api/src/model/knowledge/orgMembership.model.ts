import { GraphApi } from "../../graph";
import {
  OrgMembershipModel,
  EntityModel,
  EntityModelCreateParams,
  EntityTypeModel,
  OrgModel,
  UserModel,
} from "..";
import { extractBaseUri, workspaceAccountId } from "../util";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

export type OrgMembershipModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  responsibility: string;
  org: OrgModel;
};

/**
 * @class {@link OrgMembershipModel}
 */
export default class extends EntityModel {
  /**
   * Create a workspace OrgMembership entity.
   *
   * @param params.responsibility - the role of the user at the organization
   */
  static async createOrgMembership(
    graphApi: GraphApi,
    params: OrgMembershipModelCreateParams,
  ) {
    const { responsibility, org } = params;

    const properties: object = {
      [WORKSPACE_TYPES.propertyType.responsibility.baseUri]: responsibility,
    };

    const entityTypeModel = WORKSPACE_TYPES.entityType.orgMembership;

    const entity = await EntityModel.create(graphApi, {
      accountId: workspaceAccountId,
      properties,
      entityTypeModel,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.org,
      targetEntityModel: org,
    });

    return new OrgMembershipModel({
      accountId: workspaceAccountId,
      entityId: entity.entityId,
      version: entity.version,
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

  /**
   * Get the org linked to the org membership.
   */
  async getOrg(graphApi: GraphApi) {
    const { data: outgoingOrgLinks } = await graphApi.getLinksByQuery({
      all: [
        {
          eq: [{ path: ["source", "id"] }, { literal: this.entityId }],
        },
        {
          eq: [
            { path: ["type", "uri"] },
            {
              literal: extractBaseUri(WORKSPACE_TYPES.linkType.org.schema.$id),
            },
          ],
        },
      ],
    });

    const [outgoingOrgLink] = outgoingOrgLinks;

    if (!outgoingOrgLink) {
      /**
       * This should never be the case, as the `org` link is required on `OrgMembership` entities.
       *
       * @todo: potentially remove this when the Graph API validates entities based on their schema
       */
      throw new Error(
        `Critical: org membership with entity id ${this.entityId} doesn't have an outgoing "org" link`,
      );
    }

    return await OrgModel.getOrgById(graphApi, {
      entityId: outgoingOrgLink.targetEntityId,
    });
  }

  /**
   * Get the user linked to the org membership.
   */
  async getUser(graphApi: GraphApi) {
    const { data: incomingOrgMembershipLinks } = await graphApi.getLinksByQuery(
      {
        all: [
          {
            eq: [{ path: ["target", "id"] }, { literal: this.entityId }],
          },
          {
            eq: [
              { path: ["type", "uri"] },
              {
                literal: extractBaseUri(
                  WORKSPACE_TYPES.linkType.orgMembership.schema.$id,
                ),
              },
            ],
          },
        ],
      },
    );

    const [incomingOrgMembershipLink] = incomingOrgMembershipLinks;

    if (!incomingOrgMembershipLink) {
      throw new Error(
        `Critical: org membership with entity id ${this.entityId} doesn't have a linked user`,
      );
    }

    return await UserModel.getUserById(graphApi, {
      entityId: incomingOrgMembershipLink.sourceEntityId,
    });
  }
}
