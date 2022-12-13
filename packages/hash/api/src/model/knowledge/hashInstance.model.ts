import { GraphApi } from "../../graph";
import {
  HashInstanceModel,
  EntityModel,
  EntityModelCreateParams,
  UserModel,
} from "..";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError, NotFoundError } from "../../lib/error";
import { systemUserAccountId } from "../../graph/system-user";

export type HashInstanceModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityType" | "ownedById"
> & {
  userSelfRegistrationIsEnabled?: boolean;
  userRegistrationByInviteIsEnabled?: boolean;
  orgSelfRegistrationIsEnabled?: boolean;
};

/**
 * @class {@link HashInstanceModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entityModel: EntityModel): HashInstanceModel {
    if (
      entityModel.entityType.schema.$id !==
      SYSTEM_TYPES.entityType.hashInstance.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entityModel.getBaseId(),
        SYSTEM_TYPES.entityType.hashInstance.schema.$id,
        entityModel.entityType.schema.$id,
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

    const entityType = SYSTEM_TYPES.entityType.hashInstance;

    const entityModel = await EntityModel.create(graphApi, {
      ownedById: systemUserAccountId,
      properties: {
        [SYSTEM_TYPES.propertyType.userSelfRegistrationIsEnabled.metadata
          .editionId.baseId]: params.userSelfRegistrationIsEnabled ?? true,
        [SYSTEM_TYPES.propertyType.userRegistrationByInviteIsEnabled.metadata
          .editionId.baseId]: params.userRegistrationByInviteIsEnabled ?? true,
        [SYSTEM_TYPES.propertyType.orgSelfRegistrationIsEnabled.metadata
          .editionId.baseId]: params.orgSelfRegistrationIsEnabled ?? true,
      },
      entityType,
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

    const outgoingAdminLinkEntityModels = await this.getOutgoingLinks(
      graphApi,
      {
        linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
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
      ownedById: systemUserAccountId,
      linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
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

    const outgoingAdminLinkEntityModels = await this.getOutgoingLinks(
      graphApi,
      {
        linkEntityType: SYSTEM_TYPES.linkEntityType.admin,
        rightEntityModel: userModel,
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

  isUserSelfRegistrationEnabled(): boolean {
    return this.getProperties()[
      SYSTEM_TYPES.propertyType.userSelfRegistrationIsEnabled.metadata.editionId
        .baseId
    ] as boolean;
  }

  isUserRegistrationByInviteEnabled(): boolean {
    return this.getProperties()[
      SYSTEM_TYPES.propertyType.userRegistrationByInviteIsEnabled.metadata
        .editionId.baseId
    ] as boolean;
  }

  isOrgSelfRegistrationEnabled(): boolean {
    return this.getProperties()[
      SYSTEM_TYPES.propertyType.orgSelfRegistrationIsEnabled.metadata.editionId
        .baseId
    ] as boolean;
  }
}
