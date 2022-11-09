import { GraphApi } from "../../graph";
import {
  OrgMembershipModel,
  EntityModel,
  EntityModelCreateParams,
  OrgModel,
  UserModel,
  LinkModel,
} from "..";
import { systemAccountId } from "../util";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError } from "../../lib/error";

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
      SYSTEM_TYPES.entityType.orgMembership.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entity.entityId,
        SYSTEM_TYPES.entityType.orgMembership.schema.$id,
        entity.entityTypeModel.schema.$id,
      );
    }

    return new OrgMembershipModel(entity);
  }

  /**
   * Create a system OrgMembership entity.
   *
   * @param params.responsibility - the role of the user at the organization
   * @see {@link EntityModel.create} for remaining params
   */
  static async createOrgMembership(
    graphApi: GraphApi,
    params: OrgMembershipModelCreateParams,
  ) {
    const { responsibility, org, actorId } = params;

    const properties: object = {
      [SYSTEM_TYPES.propertyType.responsibility.baseUri]: responsibility,
    };

    const entityTypeModel = SYSTEM_TYPES.entityType.orgMembership;

    const entity = await EntityModel.create(graphApi, {
      ownedById: systemAccountId,
      properties,
      entityTypeModel,
      actorId,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: SYSTEM_TYPES.linkType.ofOrg,
      targetEntityModel: org,
      ownedById: systemAccountId,
      actorId,
    });

    return OrgMembershipModel.fromEntityModel(entity);
  }

  /**
   * Get a system organization entity by its entity id.
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
          equal: [{ path: ["source", "id"] }, { parameter: this.entityId }],
        },
        {
          equal: [
            { path: ["type", "versionedUri"] },
            {
              parameter: SYSTEM_TYPES.linkType.ofOrg.schema.$id,
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
        filter: {
          all: [
            {
              equal: [{ path: ["target", "id"] }, { parameter: this.entityId }],
            },
            {
              equal: [
                { path: ["type", "versionedUri"] },
                {
                  parameter: SYSTEM_TYPES.linkType.hasMembership.schema.$id,
                },
              ],
            },
          ],
        },
        graphResolveDepths: {
          dataTypeResolveDepth: 0,
          propertyTypeResolveDepth: 0,
          linkTypeResolveDepth: 0,
          entityTypeResolveDepth: 0,
          linkResolveDepth: 0,
          linkTargetEntityResolveDepth: 0,
        },
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
