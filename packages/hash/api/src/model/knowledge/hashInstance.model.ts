import { GraphApi } from "../../graph";
import {
  HashInstanceModel,
  EntityModel,
  EntityModelCreateParams,
  UserModel,
  LinkEntityModel,
} from "..";
import { systemAccountId } from "../util";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError, NotFoundError } from "../../lib/error";

export type HashInstanceModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "ownedById"
> & {
  userRegistrationIsEnabled?: boolean;
  orgCreationIsEnabled?: boolean;
};

/**
 * @class {@link HashInstanceModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entityModel: EntityModel): HashInstanceModel {
    if (
      entityModel.entityTypeModel.getSchema().$id !==
      SYSTEM_TYPES.entityType.hashInstance.getSchema().$id
    ) {
      throw new EntityTypeMismatchError(
        entityModel.getBaseId(),
        SYSTEM_TYPES.entityType.hashInstance.getSchema().$id,
        entityModel.entityTypeModel.getSchema().$id,
      );
    }

    return new HashInstanceModel(entityModel);
  }

  /**
   * Create the hash instance entity.
   *
   * @see {@link EntityModel.create} for the remaining params
   */
  static async createHashInstance(
    graphApi: GraphApi,
    params: HashInstanceModelCreateParams,
  ) {
    // Ensure the hash instance entity has not already been created.
    const existingHashInstance = await HashInstanceModel.getHashInstanceModel(
      graphApi,
    ).catch((error: Error) => {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    });

    if (existingHashInstance) {
      throw new Error("Hash instance entity already exists.");
    }

    const { actorId } = params;

    const entityTypeModel = SYSTEM_TYPES.entityType.hashInstance;

    const entityModel = await EntityModel.create(graphApi, {
      ownedById: systemAccountId,
      properties: {
        [SYSTEM_TYPES.propertyType.userRegistrationIsEnabled.getBaseUri()]:
          params.userRegistrationIsEnabled ?? true,
        [SYSTEM_TYPES.propertyType.orgCreationIsEnabled.getBaseUri()]:
          params.orgCreationIsEnabled ?? true,
      },
      entityTypeModel,
      actorId,
    });

    return HashInstanceModel.fromEntityModel(entityModel);
  }

  /**
   * Get the hash instance.
   */
  static async getHashInstanceModel(
    graphApi: GraphApi,
  ): Promise<HashInstanceModel> {
    const entities = await EntityModel.getByQuery(graphApi, {
      all: [
        { equal: [{ path: ["version"] }, { parameter: "latest" }] },
        {
          equal: [
            { path: ["type", "versionedUri"] },
            {
              parameter: SYSTEM_TYPES.entityType.hashInstance.getSchema().$id,
            },
          ],
        },
      ],
    });

    if (entities.length > 1) {
      throw new Error("More than one hash instance entity found in the graph.");
    }

    const entity = entities[0];

    if (!entity) {
      throw new NotFoundError("Could not find hash instance entity.");
    }

    return HashInstanceModel.fromEntityModel(entity);
  }

  /**
   * Check whether or not the user is a hash instance admin.
   *
   * @param params.userModel - the user that may be a hash instance admin.
   */
  async hasAdmin(
    graphApi: GraphApi,
    params: { userModel: UserModel },
  ): Promise<boolean> {
    const { userModel } = params;

    const outgoingAdminLinkEntityModels = await this.getOutgoingLinks(
      graphApi,
      {
        linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.admin,
        rightEntityModel: userModel,
      },
    );

    if (outgoingAdminLinkEntityModels.length > 1) {
      throw new Error(
        "Critical: more than one outgoing admin link from the HASH instance entity to the same user was found.",
      );
    }

    return outgoingAdminLinkEntityModels.length === 1;
  }

  /**
   * Add an instance admin to the hash instance.
   *
   * @param params.userModel - the user to be added as a hash instance admin.
   */
  async addAdmin(
    graphApi: GraphApi,
    params: { userModel: UserModel; actorId: string },
  ): Promise<void> {
    const { userModel, actorId } = params;

    const isAlreadyHashInstanceAdmin = await this.hasAdmin(graphApi, {
      userModel,
    });

    if (isAlreadyHashInstanceAdmin) {
      throw new Error(
        `User with entityId "${userModel.getBaseId()}" is already a hash instance admin.`,
      );
    }

    await this.createOutgoingLink(graphApi, {
      ownedById: systemAccountId,
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.admin,
      rightEntityModel: userModel,
      actorId,
    });
  }

  /**
   * Remove an instance admin from the hash instance.
   *
   * @param params.userModel - the user to be removed as a hash instance admin.
   */
  async removeAdmin(
    graphApi: GraphApi,
    params: { userModel: UserModel; actorId: string },
  ): Promise<void> {
    const { userModel, actorId } = params;

    const outgoingAdminLinkEntityModels = await LinkEntityModel.getByQuery(
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
                parameter: SYSTEM_TYPES.linkEntityType.admin.getSchema().$id,
              },
            ],
          },
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              { parameter: userModel.getEntityUuid() },
            ],
          },
          {
            equal: [
              { path: ["rightEntity", "ownedById"] },
              { parameter: userModel.getOwnedById() },
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

    if (outgoingAdminLinkEntityModels.length > 1) {
      throw new Error(
        "Critical: more than one outgoing admin link from the HASH instance entity to the same user was found.",
      );
    }

    const [outgoingAdminLinkEntityModel] = outgoingAdminLinkEntityModels;

    if (!outgoingAdminLinkEntityModel) {
      throw new Error(
        `The user with entity ID ${userModel.getBaseId()} is not a HASH instance admin.`,
      );
    }

    await outgoingAdminLinkEntityModel.archive(graphApi, { actorId });
  }

  isUserRegistrationDisabled(): boolean {
    return (this.getProperties() as any)[
      SYSTEM_TYPES.propertyType.userRegistrationIsEnabled.getBaseUri()
    ];
  }

  isOrgCreationDisabled(): boolean {
    return (this.getProperties() as any)[
      SYSTEM_TYPES.propertyType.orgCreationIsEnabled.getBaseUri()
    ];
  }
}
