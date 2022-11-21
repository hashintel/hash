import { GraphApi } from "@hashintel/hash-graph-client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { EntityId } from "@hashintel/hash-subgraph";
import {
  CommentModel,
  EntityModel,
  EntityModelCreateParams,
  UserModel,
} from "..";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError } from "../../lib/error";

type CommentModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel"
> & {
  author: UserModel;
  parent: EntityModel;
  tokens: TextToken[];
};

/**
 * @class {@link CommentModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entity: EntityModel): CommentModel {
    if (
      entity.entityTypeModel.schema.$id !==
      SYSTEM_TYPES.entityType.comment.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entity.baseId,
        SYSTEM_TYPES.entityType.comment.schema.$id,
        entity.entityTypeModel.schema.$id,
      );
    }

    return new CommentModel({
      entity,
      entityTypeModel: entity.entityTypeModel,
    });
  }

  /**
   * Get a system comment entity by its entity id.
   *
   * @param params.entityId - the entity id of the comment
   */
  static async getCommentById(
    graphApi: GraphApi,
    params: { entityId: EntityId },
  ): Promise<CommentModel> {
    const entity = await EntityModel.getLatest(graphApi, params);

    return CommentModel.fromEntityModel(entity);
  }

  /**
   * Create a system comment entity.
   *
   * @param params.author - the user that created the comment
   * @param params.parent - the linked parent entity
   * @param params.tokens - the text tokens that describe the comment's text
   * @see {@link EntityModel.create} for remaining params
   */
  static async createComment(
    graphApi: GraphApi,
    params: CommentModelCreateParams,
  ): Promise<CommentModel> {
    const { ownedById, actorId, tokens, parent, author } = params;

    const entityTypeModel = SYSTEM_TYPES.entityType.comment;

    const entity = await EntityModel.create(graphApi, {
      ownedById,
      properties: {},
      entityTypeModel,
      actorId,
    });

    const textEntity = await EntityModel.create(graphApi, {
      ownedById,
      properties: {
        [SYSTEM_TYPES.propertyType.tokens.baseUri]: tokens,
      },
      entityTypeModel: SYSTEM_TYPES.entityType.text,
      actorId,
    });

    await entity.createOutgoingLink(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.hasText,
      rightEntityModel: textEntity,
      ownedById,
      actorId,
    });

    await entity.createOutgoingLink(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.parent,
      rightEntityModel: parent,
      ownedById,
      actorId,
    });

    await entity.createOutgoingLink(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.author,
      rightEntityModel: author,
      ownedById,
      actorId,
    });

    return CommentModel.fromEntityModel(entity);
  }

  /**
   * Edit the text content of a comment.
   *
   * @param params.actorId - id of the user that edited the comment
   * @param params.tokens - the new text tokens that describe the comment's text
   */
  async updateText(
    graphApi: GraphApi,
    params: {
      actorId: string;
      tokens: TextToken[];
    },
  ): Promise<CommentModel> {
    const { actorId, tokens } = params;

    if (actorId !== this.ownedById) {
      throw new Error(
        `Critical: account ${actorId} does not have permission to edit the comment with entityId ${this.baseId}`,
      );
    }

    const textEntityModel = await this.getHasText(graphApi);

    await textEntityModel.updateProperty(graphApi, {
      propertyTypeBaseUri: SYSTEM_TYPES.propertyType.tokens.baseUri,
      value: tokens,
      actorId,
    });

    return CommentModel.fromEntityModel(this);
  }

  /**
   * Resolve the comment.
   *
   * @param params.actorId - id of the user that resolved the comment
   */
  async resolve(
    graphApi: GraphApi,
    params: {
      actorId: string;
    },
  ): Promise<CommentModel> {
    const { actorId } = params;

    const parentModel = await this.getParent(graphApi);

    // Throw error if the user trying to resolve the comment is not the comment's author
    // or the author of the block the comment is attached to
    if (
      actorId !== this.ownedById &&
      parentModel.entityTypeModel.schema.$id ===
        SYSTEM_TYPES.entityType.block.schema.$id &&
      actorId !== parentModel.ownedById
    ) {
      throw new Error(
        `Critical: account ${actorId} does not have permission to resolve the comment with entityId ${this.baseId}`,
      );
    }

    await this.updateProperties(graphApi, {
      updatedProperties: [
        {
          propertyTypeBaseUri: SYSTEM_TYPES.propertyType.resolvedAt.baseUri,
          value: new Date().toISOString(),
        },
      ],
      actorId,
    });

    return CommentModel.fromEntityModel(this);
  }

  /**
   * Delete the comment.
   *
   * @param params.actorId - id of the user that deleted the comment
   */
  async delete(
    graphApi: GraphApi,
    params: {
      actorId: string;
    },
  ): Promise<CommentModel> {
    const { actorId } = params;

    // Throw error if the user trying to delete the comment is not the comment's author
    if (actorId !== this.ownedById) {
      throw new Error(
        `Critical: account ${actorId} does not have permission to delete the comment with entityId ${this.baseId}`,
      );
    }

    await this.updateProperties(graphApi, {
      updatedProperties: [
        {
          propertyTypeBaseUri: SYSTEM_TYPES.propertyType.deletedAt.baseUri,
          value: new Date().toISOString(),
        },
      ],
      actorId,
    });

    return CommentModel.fromEntityModel(this);
  }

  /**
   * Get the value of the "Resolved At" property of the comment.
   */
  getResolvedAt(): string {
    return (this.properties as any)[
      SYSTEM_TYPES.propertyType.resolvedAt.baseUri
    ];
  }

  /**
   * Get the value of the "Deleted At" property of the comment.
   */
  getDeletedAt(): string {
    return (this.properties as any)[
      SYSTEM_TYPES.propertyType.deletedAt.baseUri
    ];
  }

  /**
   * Get the text entity linked to the comment.
   */
  async getHasText(graphApi: GraphApi): Promise<EntityModel> {
    const hasTextLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.hasText,
    });

    const [hasTextLink, ...unexpectedHasTextLinks] = hasTextLinks;

    if (unexpectedHasTextLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.baseId} has more than one linked text entities`,
      );
    }

    if (!hasTextLink) {
      throw new Error(
        `Critical: Comment with entityId ${this.baseId} doesn't have any linked text entities`,
      );
    }

    return hasTextLink.rightEntityModel;
  }

  /**
   * Get the parent entity linked to the comment (either a block or another comment).
   */
  async getParent(graphApi: GraphApi): Promise<EntityModel> {
    const parentLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.parent,
    });

    const [parentLink, ...unexpectedParentLinks] = parentLinks;

    if (!parentLink) {
      throw new Error(
        `Critical: comment with entityId ${this.baseId} has no linked parent entity`,
      );
    }

    if (unexpectedParentLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.baseId} has more than one linked parent entity`,
      );
    }

    return parentLink.rightEntityModel;
  }

  /**
   * Get the user entity that created the comment.
   */
  async getAuthor(graphApi: GraphApi): Promise<UserModel> {
    const authorLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.author,
    });

    const [authorLink, ...unexpectedAuthorLinks] = authorLinks;

    if (!authorLink) {
      throw new Error(
        `Critical: comment with entityId ${this.baseId} has no linked author entity`,
      );
    }

    if (unexpectedAuthorLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.baseId} has more than one linked author entity`,
      );
    }

    return UserModel.fromEntityModel(authorLink.rightEntityModel);
  }

  /**
   * Get the children comment entities of the comment.
   */
  async getReplies(graphApi: GraphApi): Promise<CommentModel[]> {
    const replyLinks = await this.getIncomingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.parent,
    });

    return replyLinks.map((reply) =>
      CommentModel.fromEntityModel(reply.rightEntityModel),
    );
  }
}
