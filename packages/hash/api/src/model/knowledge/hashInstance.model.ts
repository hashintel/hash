import { GraphApi } from "../../graph";
import {
  HashInstanceModel,
  EntityModel,
  EntityModelCreateParams,
  UserModel,
  LinkModel,
} from "..";
import { systemAccountId } from "../util";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError, NotFoundError } from "../../lib/error";

export type HashInstanceModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "ownedById"
>;

/**
 * @class {@link HashInstanceModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entity: EntityModel): HashInstanceModel {
    if (
      entity.entityTypeModel.schema.$id !==
      SYSTEM_TYPES.entityType.hashInstance.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entity.entityId,
        SYSTEM_TYPES.entityType.hashInstance.schema.$id,
        entity.entityTypeModel.schema.$id,
      );
    }

    return new HashInstanceModel(entity);
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
      properties: {},
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
              parameter: SYSTEM_TYPES.entityType.hashInstance.schema.$id,
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

    return await LinkModel.get(graphApi, {
      sourceEntityId: this.entityId,
      linkTypeId: SYSTEM_TYPES.linkType.admin.schema.$id,
      targetEntityId: userModel.entityId,
    })
      .then(() => true)
      .catch((error: Error) => {
        if (error instanceof NotFoundError) {
          return false;
        }
        throw error;
      });
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
        `User with entityId "${userModel.entityId}" is already a hash instance admin.`,
      );
    }

    await this.createOutgoingLink(graphApi, {
      ownedById: systemAccountId,
      linkTypeModel: SYSTEM_TYPES.linkType.admin,
      targetEntityModel: userModel,
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

    const adminLink = await LinkModel.get(graphApi, {
      sourceEntityId: this.entityId,
      linkTypeId: SYSTEM_TYPES.linkType.admin.schema.$id,
      targetEntityId: userModel.entityId,
    });

    await adminLink.remove(graphApi, { actorId });
  }
}
