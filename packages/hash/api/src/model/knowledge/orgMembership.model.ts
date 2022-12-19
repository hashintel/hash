import { EntityId, PropertyObject } from "@hashintel/hash-subgraph";
import { GraphApi } from "../../graph";
import {
  OrgMembershipModel,
  EntityModelCreateParams,
  OrgModel,
  UserModel,
  LinkEntityModel,
  LinkModelConstructorParams,
} from "..";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError } from "../../lib/error";

export type OrgMembershipModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityType" | "ownedById"
> & {
  responsibility: string;
  org: OrgModel;
  user: UserModel;
};

export default class extends LinkEntityModel {
  constructor({
    linkEntity,
    linkEntityType,
    leftEntityModel,
    rightEntityModel,
  }: LinkModelConstructorParams) {
    if (
      linkEntityType.schema.$id !==
      SYSTEM_TYPES.linkEntityType.orgMembership.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        linkEntity.metadata.editionId.baseId,
        SYSTEM_TYPES.linkEntityType.orgMembership.schema.$id,
        linkEntityType.schema.$id,
      );
    }
    super({
      linkEntity,
      linkEntityType,
      leftEntityModel,
      rightEntityModel,
    });
  }

  static fromLinkEntityModel(
    linkEntityModel: LinkEntityModel,
  ): OrgMembershipModel {
    if (
      linkEntityModel.entityType.schema.$id !==
      SYSTEM_TYPES.linkEntityType.orgMembership.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        linkEntityModel.getBaseId(),
        SYSTEM_TYPES.linkEntityType.orgMembership.schema.$id,
        linkEntityModel.entityType.schema.$id,
      );
    }

    return new OrgMembershipModel({
      ...linkEntityModel,
      linkEntity: linkEntityModel.entity,
      linkEntityType: linkEntityModel.entityType,
    });
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
    const { responsibility, org, user, actorId } = params;

    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.responsibility.metadata.editionId.baseId]:
        responsibility,
    };

    const entity = await user.createOutgoingLink(graphApi, {
      ownedById: org.getEntityUuid(),
      linkEntityType: SYSTEM_TYPES.linkEntityType.orgMembership,
      rightEntityModel: org,
      properties,
      actorId,
    });

    return OrgMembershipModel.fromLinkEntityModel(entity);
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
    const entityModel = await LinkEntityModel.getLatest(graphApi, {
      entityId: params.entityId,
    });

    return entityModel
      ? OrgMembershipModel.fromLinkEntityModel(
          await LinkEntityModel.fromEntity(graphApi, entityModel.entity),
        )
      : null;
  }

  /**
   * Get the org linked to the org membership.
   */
  getOrg(): OrgModel {
    return OrgModel.fromEntityModel(this.rightEntityModel);
  }

  /**
   * Get the user linked to the org membership.
   */
  getUser(): UserModel {
    return UserModel.fromEntityModel(this.leftEntityModel);
  }
}
