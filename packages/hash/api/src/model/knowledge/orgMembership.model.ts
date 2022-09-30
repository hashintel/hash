import { GraphApi } from "../../graph";
import {
  OrgMembershipModel,
  EntityModel,
  EntityModelCreateParams,
  OrgModel,
  UserModel,
  LinkModel,
} from "..";
import { workspaceAccountId } from "../util";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

export type OrgMembershipModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "ownedById"
> & {
  responsibility: string;
  org: OrgModel;
};

/**
 * @class {@link OrgMembershipModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entity: EntityModel): OrgMembershipModel {
    if (
      entity.entityTypeModel.schema.$id !==
      WORKSPACE_TYPES.entityType.orgMembership.schema.$id
    ) {
      throw new Error(
        `Entity with id ${entity.entityId} is not a workspace org membership`,
      );
    }

    return new OrgMembershipModel(entity);
  }

  /**
   * Create a workspace OrgMembership entity.
   *
   * @param params.responsibility - the role of the user at the organization
   * @see {@link EntityModel.create} for remaining params
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
      ownedById: workspaceAccountId,
      properties,
      entityTypeModel,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.ofOrg,
      targetEntityModel: org,
      ownedById: workspaceAccountId,
    });

    return OrgMembershipModel.fromEntityModel(entity);
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
      entityId: params.entityId,
    });

    return entity ? OrgMembershipModel.fromEntityModel(entity) : null;
  }

  /**
   * Get the org linked to the org membership.
   */
  async getOrg(graphApi: GraphApi): Promise<OrgModel> {
    const outgoingOrgLinks = await LinkModel.getByQuery(graphApi, {
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

    const { targetEntityModel: orgEntityModel } = outgoingOrgLink;

    return OrgModel.fromEntityModel(orgEntityModel);
  }

  /**
   * Get the user linked to the org membership.
   */
  async getUser(graphApi: GraphApi) {
    const { data: incomingOrgMembershipLinks } = await graphApi.getLinksByQuery(
      {
        query: {
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
        dataTypeQueryDepth: 0,
        propertyTypeQueryDepth: 0,
        linkTypeQueryDepth: 0,
        entityTypeQueryDepth: 0,
        linkTargetEntityQueryDepth: 0,
        linkQueryDepth: 0,
      },
    );

    const [incomingOrgMembershipLinkRootedSubgraph] =
      incomingOrgMembershipLinks;

    if (!incomingOrgMembershipLinkRootedSubgraph) {
      throw new Error(
        `Critical: org membership with entity id ${this.entityId} doesn't have a linked user`,
      );
    }

    return await UserModel.getUserById(graphApi, {
      entityId:
        incomingOrgMembershipLinkRootedSubgraph.link.inner.sourceEntityId,
    });
  }
}
