import { GraphApi } from "@hashintel/hash-graph-client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import {
  EntityModel,
  CommentModel,
  EntityModelCreateParams,
  UserModel,
  PageModel,
} from "..";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

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
      WORKSPACE_TYPES.entityType.comment.schema.$id
    ) {
      throw new Error(
        `Entity with id ${entity.entityId} is not a workspace comment`,
      );
    }

    return new CommentModel(entity);
  }

  /**
   * Get a workspace comment entity by its entity id.
   *
   * @param params.entityId - the entity id of the comment
   */
  static async getCommentById(
    graphApi: GraphApi,
    params: { entityId: string },
  ): Promise<CommentModel> {
    const entity = await EntityModel.getLatest(graphApi, params);

    return CommentModel.fromEntityModel(entity);
  }

  /**
   * Create a workspace block entity.
   *
   * @param params.componentId - the component id of the block
   * @param params.blockData - the linked block data entity
   * @see {@link EntityModel.create} for remaining params
   */
  static async createComment(
    graphApi: GraphApi,
    params: CommentModelCreateParams,
  ): Promise<CommentModel> {
    const { ownedById } = params;

    const entityTypeModel = WORKSPACE_TYPES.entityType.comment;

    const entity = await EntityModel.create(graphApi, {
      ownedById,
      properties: {},
      entityTypeModel,
    });

    const { tokens, parent, author } = params;

    const textEntity = await EntityModel.create(graphApi, {
      ownedById,
      properties: {
        [WORKSPACE_TYPES.propertyType.tokens.baseUri]: tokens,
      },
      entityTypeModel: WORKSPACE_TYPES.entityType.text,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.hasText,
      targetEntityModel: textEntity,
      ownedById,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.parent,
      targetEntityModel: parent,
      ownedById,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.author,
      targetEntityModel: author,
      ownedById,
    });

    return CommentModel.fromEntityModel(entity);
  }

  static async getAllCommentsInPage(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      pageId: string;
    },
  ): Promise<CommentModel[]> {
    const { ownedById, pageId } = params;

    const pageEntity = await PageModel.getPageById(graphApi, {
      entityId: pageId,
    });

    if (!pageEntity) {
      throw new Error(
        `Page with entityId ${pageId} not found found in account ${ownedById}`,
      );
    }

    const pageBlocks = await pageEntity.getBlocks(graphApi);

    const comments = await Promise.all(
      pageBlocks.map(async (block) => await block.getBlockComments(graphApi)),
    );

    return comments.flat();
  }

  /**
   * Get the value of the "ResolvedAt" property of the comment.
   */
  getResolvedAt(): string {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.resolvedAt.baseUri
    ];
  }

  /**
   * Get the parent page of the page.
   */
  async getHasText(graphApi: GraphApi): Promise<EntityModel> {
    const hasTextLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.hasText,
    });

    const [hasTextLink, ...unexpectedHasTextLinks] = hasTextLinks;

    if (unexpectedHasTextLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.entityId} in account ${this.ownedById} has more than one linked text entities`,
      );
    }

    if (!hasTextLink) {
      throw new Error(
        `Critical: Comment with entityId ${this.entityId} in account ${this.ownedById} doesn't have any linked text entities`,
      );
    }

    return hasTextLink.targetEntityModel;
  }

  async getParent(graphApi: GraphApi): Promise<EntityModel> {
    const parentLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.parent,
    });

    const [parentLink, ...unexpectedParentLinks] = parentLinks;

    if (!parentLink) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account ${this.ownedById} has no linked parent entity`,
      );
    }

    if (unexpectedParentLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.entityId} in account ${this.ownedById} has more than one linked parent entity`,
      );
    }

    return parentLink.targetEntityModel;
  }

  async getAuthor(graphApi: GraphApi): Promise<UserModel> {
    const authorLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.author,
    });

    const [authorLink, ...unexpectedAuthorLinks] = authorLinks;

    if (!authorLink) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account ${this.ownedById} has no linked author entity`,
      );
    }

    if (unexpectedAuthorLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.entityId} in account ${this.ownedById} has more than one linked author entity`,
      );
    }

    return UserModel.fromEntityModel(authorLink.targetEntityModel);
  }

  async getReplies(graphApi: GraphApi): Promise<CommentModel[]> {
    const replyLinks = await this.getIncomingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.parent,
    });

    const replies = replyLinks.map((reply) =>
      CommentModel.fromEntityModel(reply.sourceEntityModel),
    );

    return replies;
    // return replies.sort(
    //   (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    // );
  }
}
