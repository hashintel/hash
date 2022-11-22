import { EntityId, PropertyObject } from "@hashintel/hash-subgraph";
import { GraphApi } from "../../graph";
import {
  OrgMembershipModel,
  EntityModel,
  EntityModelCreateParams,
  OrgModel,
  UserModel,
  LinkEntityModel,
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
 *
 * @todo: turn into link entity model when or memberships are stored in link entities
 * @see https://app.asana.com/0/0/1203371754468058/f
 */
export default class extends EntityModel {
  static fromEntityModel(entityModel: EntityModel): OrgMembershipModel {
    if (
      entityModel.entityTypeModel.getSchema().$id !==
      SYSTEM_TYPES.entityType.orgMembership.getSchema().$id
    ) {
      throw new EntityTypeMismatchError(
        entityModel.getBaseId(),
        SYSTEM_TYPES.entityType.orgMembership.getSchema().$id,
        entityModel.entityTypeModel.getSchema().$id,
      );
    }

    return new OrgMembershipModel(entityModel);
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

    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.responsibility.getBaseUri()]: responsibility,
    };

    const entityTypeModel = SYSTEM_TYPES.entityType.orgMembership;

    const entity = await EntityModel.create(graphApi, {
      ownedById: systemAccountId,
      properties,
      entityTypeModel,
      actorId,
    });

    await entity.createOutgoingLink(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.ofOrg,
      rightEntityModel: org,
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
    params: { entityId: EntityId },
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
    const outgoingOrgLinkEntityModels = await LinkEntityModel.getByQuery(
      graphApi,
      {
        all: [
          {
            equal: [
              { path: ["leftEntity", "uuid"] },
              { parameter: this.getEntityUuid() },
            ],
          },
          {
            equal: [
              { path: ["leftEntity", "ownedById"] },
              { parameter: this.getOwnedById() },
            ],
          },
          {
            equal: [
              { path: ["type", "versionedUri"] },
              {
                parameter: SYSTEM_TYPES.linkEntityType.ofOrg.getSchema().$id,
              },
            ],
          },
          {
            equal: [{ path: ["version"] }, { parameter: "latest" }],
          },
          {
            equal: [{ path: ["archived"] }, { parameter: false }],
          },
        ],
      },
    );

    const [outgoingOrgLinkEntityModel] = outgoingOrgLinkEntityModels;

    if (!outgoingOrgLinkEntityModel) {
      /**
       * This should never be the case, as the `org` link is required on `OrgMembership` entities.
       *
       * @todo: potentially remove this when the Graph API validates entities based on their schema
       */
      throw new Error(
        `Critical: org membership with entity id ${this.getBaseId()} doesn't have an outgoing "org" link`,
      );
    }

    const { rightEntityModel: orgEntityModel } = outgoingOrgLinkEntityModel;

    return OrgModel.fromEntityModel(orgEntityModel);
  }

  /**
   * Get the user linked to the org membership.
   */
  async getUser(graphApi: GraphApi) {
    const incomingOrgMembershipLinkEntityModels =
      await LinkEntityModel.getByQuery(graphApi, {
        all: [
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              { parameter: this.getEntityUuid() },
            ],
          },
          {
            equal: [
              { path: ["leftEntity", "ownedById"] },
              { parameter: this.getOwnedById() },
            ],
          },
          {
            equal: [
              { path: ["type", "versionedUri"] },
              {
                parameter:
                  SYSTEM_TYPES.linkEntityType.hasMembership.getSchema().$id,
              },
            ],
          },
          {
            equal: [{ path: ["version"] }, { parameter: "latest" }],
          },
          {
            equal: [{ path: ["archived"] }, { parameter: false }],
          },
        ],
      });

    const [incomingOrgMembershipLinkEntityModel] =
      incomingOrgMembershipLinkEntityModels;

    if (!incomingOrgMembershipLinkEntityModel) {
      throw new Error(
        `Critical: org membership with entity id ${this.getBaseId()} doesn't have a linked user`,
      );
    }

    return UserModel.fromEntityModel(
      incomingOrgMembershipLinkEntityModel.leftEntityModel,
    );
  }
}
