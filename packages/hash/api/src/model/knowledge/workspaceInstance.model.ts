import { GraphApi } from "../../graph";
import {
  WorkspaceInstanceModel,
  EntityModel,
  EntityModelCreateParams,
  UserModel,
  LinkModel,
} from "..";
import { workspaceAccountId } from "../util";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";
import { EntityTypeMismatchError, NotFoundError } from "../../lib/error";

export type WorkspaceInstanceModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "ownedById"
> & {};

/**
 * @class {@link WorkspaceInstanceModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entity: EntityModel): WorkspaceInstanceModel {
    if (
      entity.entityTypeModel.schema.$id !==
      WORKSPACE_TYPES.entityType.workspaceInstance.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entity.entityId,
        WORKSPACE_TYPES.entityType.workspaceInstance.schema.$id,
        entity.entityTypeModel.schema.$id,
      );
    }

    return new WorkspaceInstanceModel(entity);
  }

  /**
   * Create the workspace instance entity.
   *
   * @see {@link EntityModel.create} for the remaining params
   */
  static async createWorkspaceInstance(
    graphApi: GraphApi,
    params: WorkspaceInstanceModelCreateParams,
  ) {
    // Ensure the workspace instance entity has not already been created.
    await WorkspaceInstanceModel.getWorkspaceInstanceModel(graphApi)
      .then(() => {
        throw new Error("Workspace instance entity already exists.");
      })
      .catch((error: Error) => {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      });

    const { actorId } = params;

    const entityTypeModel = WORKSPACE_TYPES.entityType.workspaceInstance;

    const entityModel = await EntityModel.create(graphApi, {
      ownedById: workspaceAccountId,
      properties: {},
      entityTypeModel,
      actorId,
    });

    return WorkspaceInstanceModel.fromEntityModel(entityModel);
  }

  /**
   * Get the workspace instance.
   */
  static async getWorkspaceInstanceModel(
    graphApi: GraphApi,
  ): Promise<WorkspaceInstanceModel> {
    const entities = await EntityModel.getByQuery(graphApi, {
      all: [
        { equal: [{ path: ["version"] }, { parameter: "latest" }] },
        {
          equal: [
            { path: ["type", "versionedUri"] },
            {
              parameter:
                WORKSPACE_TYPES.entityType.workspaceInstance.schema.$id,
            },
          ],
        },
      ],
    });

    if (entities.length > 1) {
      throw new Error(
        "More than one workspace instance entity found in the graph.",
      );
    }

    const entity = entities[0];

    if (!entity) {
      throw new NotFoundError("Could not find workspace instance entity.");
    }

    return WorkspaceInstanceModel.fromEntityModel(entity);
  }

  /**
   * Check whether or not the user is a workspace instance admin.
   *
   * @param params.userModel - the user that may be a workspace instance admin.
   */
  async hasAdmin(
    graphApi: GraphApi,
    params: { userModel: UserModel },
  ): Promise<boolean> {
    const { userModel } = params;

    return await LinkModel.get(graphApi, {
      sourceEntityId: this.entityId,
      linkTypeId: WORKSPACE_TYPES.linkType.admin.schema.$id,
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
   * Add an instance admin to the workspace instance.
   *
   * @param params.userModel - the user to be added as a workspace instance admin.
   */
  async addAdmin(
    graphApi: GraphApi,
    params: { userModel: UserModel; actorId: string },
  ): Promise<void> {
    const { userModel, actorId } = params;

    const isAlreadyWorkspaceInstanceAdmin = await this.hasAdmin(graphApi, {
      userModel,
    });

    if (isAlreadyWorkspaceInstanceAdmin) {
      throw new Error(
        `User with entityId "${userModel.entityId}" is already a workspace instance admin.`,
      );
    }

    await this.createOutgoingLink(graphApi, {
      ownedById: workspaceAccountId,
      linkTypeModel: WORKSPACE_TYPES.linkType.admin,
      targetEntityModel: userModel,
      actorId,
    });
  }

  /**
   * Remove an instance admin from the workspace instance.
   *
   * @param params.userModel - the user to be removed as a workspace instance admin.
   */
  async removeAdmin(
    graphApi: GraphApi,
    params: { userModel: UserModel; actorId: string },
  ): Promise<void> {
    const { userModel, actorId } = params;

    const adminLink = await LinkModel.get(graphApi, {
      sourceEntityId: this.entityId,
      linkTypeId: WORKSPACE_TYPES.linkType.admin.schema.$id,
      targetEntityId: userModel.entityId,
    });

    await adminLink.remove(graphApi, { actorId });
  }
}
