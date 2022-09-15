import { GraphApi } from "../../graph";
import {
  OrgMembershipModel,
  EntityModel,
  EntityModelCreateParams,
  OrgModel,
  UserModel,
} from "..";
import { workspaceAccountId } from "../util";
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
      linkTypeModel: WORKSPACE_TYPES.linkType.ofOrg,
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
   * Get a workspace organization entity by its entity id.
   *
   * @param params.entityId - the entity id of the organization
   */
  static async getOrgMembershipById(
    graphApi: GraphApi,
    params: { entityId: string },
  ): Promise<OrgMembershipModel | null> {
    const entity = await EntityModel.getLatest(graphApi, {
      // assumption: `accountId` of organizations is always the workspace account id
      accountId: workspaceAccountId,
      entityId: params.entityId,
    });

    if (
      entity.entityTypeModel.schema.$id !==
      WORKSPACE_TYPES.entityType.orgMembership.schema.$id
    ) {
      throw new Error(
        `Entity with id ${params.entityId} is not a workspace org membership`,
      );
    }

    return entity ? new OrgMembershipModel(entity) : null;
  }

  /**
   * Get the org linked to the org membership.
   */
  async getOrg(graphApi: GraphApi): Promise<OrgModel> {
    const { data: outgoingOrgLinks } = await graphApi.getLinksByQuery({
      all: [
        {
          eq: [{ path: ["source", "id"] }, { literal: this.entityId }],
        },
        {
          eq: [
            { path: ["type", "versionedUri"] },
            {
              literal: WORKSPACE_TYPES.linkType.ofOrg.schema.$id,
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

    const { targetEntityId: orgEntityId } = outgoingOrgLink;

    const orgModel = await OrgModel.getOrgById(graphApi, {
      entityId: orgEntityId,
    });

    if (!orgModel) {
      throw new Error(
        `Critical: org membership with entity id ${this.entityId} links to non-existent org with id ${orgEntityId}`,
      );
    }

    return orgModel;
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
              { path: ["type", "versionedUri"] },
              {
                literal: WORKSPACE_TYPES.linkType.hasMembership.schema.$id,
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
