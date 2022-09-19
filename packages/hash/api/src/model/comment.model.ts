import { TextToken } from "@hashintel/hash-shared/graphql/types";
import {
  Entity,
  EntityConstructorArgs,
  EntityExternalResolvers,
  Comment,
  UnresolvedGQLEntityType,
  User,
  Block,
} from ".";
import { DbClient } from "../db";
import {
  DbCommentProperties,
  DbTextProperties,
  EntityType,
} from "../db/adapter";
import {
  SystemTypeName,
  Comment as GQLComment,
  LinkedEntityDefinition,
} from "../graphql/apiTypes.gen";

export type CommentExternalResolvers = EntityExternalResolvers | "contents"; // contents resolved in `src/graphql/resolvers/Comments/linkedEntities.ts`

export type UnresolvedGQLComment = Omit<
  GQLComment,
  CommentExternalResolvers
> & {
  entityType: UnresolvedGQLEntityType;
};

export type CommentConstructorArgs = {
  properties: DbCommentProperties;
} & EntityConstructorArgs;

class __Comment extends Entity {
  properties: DbCommentProperties;

  constructor(args: CommentConstructorArgs) {
    super(args);
    this.properties = args.properties;
  }

  static async getEntityType(client: DbClient): Promise<EntityType> {
    const commentEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "Comment",
    });
    return commentEntityType;
  }

  static async createComment(
    client: DbClient,
    params: {
      createdBy: User;
      parent: Block;
      accountId: string;
      content: TextToken[];
    },
  ): Promise<Comment> {
    const { createdBy, parent, accountId, content } = params;

    const textProperties: DbTextProperties = {
      tokens: content,
    };

    const linkedEntities: LinkedEntityDefinition[] = [
      {
        path: "$.contents",
        destinationAccountId: accountId,
        entity: {
          entityType: {
            systemTypeName: SystemTypeName.Text,
          },
          entityProperties: textProperties,
        },
      },
      {
        path: "$.owner",
        destinationAccountId: accountId,
        entity: {
          existingEntity: {
            accountId: createdBy.accountId,
            entityId: createdBy.entityId,
          },
        },
      },
      {
        path: "$.parent",
        destinationAccountId: accountId,
        entity: {
          existingEntity: {
            accountId: parent.accountId,
            entityId: parent.entityId,
          },
        },
      },
    ];

    const commentProperties: DbCommentProperties = {
      createdAt: new Date().toISOString(),
    };

    const entity = await Entity.createEntityWithLinks(client, {
      user: createdBy,
      accountId,
      entityDefinition: {
        entityProperties: commentProperties,
        versioned: true,
        entityType: {
          systemTypeName: SystemTypeName.Comment,
        },
        linkedEntities,
      },
    });

    return new Comment({ ...entity, properties: commentProperties });
  }

  static async getCommentById(
    client: DbClient,
    params: { accountId: string; entityId: string },
  ): Promise<Comment | null> {
    const { accountId, entityId } = params;
    const dbComment = await client.getEntityLatestVersion({
      accountId,
      entityId,
    });

    if (dbComment) {
      if (
        dbComment.entityTypeId !==
        (await Comment.getEntityType(client)).entityId
      ) {
        throw new Error(
          `Entity with entityId ${entityId} in account ${accountId} is not a Comment`,
        );
      }
      return new Comment(dbComment);
    }

    return null;
  }

  async getContents(client: DbClient): Promise<Entity> {
    const contentsLinks = await this.getOutgoingLinks(client, {
      path: ["contents"],
    });

    const [contentLink, ...unexpectedContentLinks] = contentsLinks;

    if (!contentLink) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account with accountId ${this.accountId} has no linked contents entity`,
      );
    }
    if (unexpectedContentLinks.length > 0) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account with accountId ${this.accountId} has more than one linked contents entity`,
      );
    }

    return contentLink.getDestination(client);
  }

  async getParent(client: DbClient): Promise<Block | null> {
    const parentLinks = await this.getOutgoingLinks(client, {
      path: ["parent"],
    });

    const [parentLink, ...unexpectedParentLinks] = parentLinks;

    if (!parentLink) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account with accountId ${this.accountId} has no linked parent entity`,
      );
    }

    if (unexpectedParentLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.entityId} in account ${this.accountId} has more than one linked parent entity`,
      );
    }

    const destinationEntity = await parentLink.getDestination(client);
    return await Block.fromEntity(client, destinationEntity);
  }

  async getOwner(client: DbClient): Promise<Entity> {
    const ownerLinks = await this.getOutgoingLinks(client, {
      path: ["owner"],
    });

    const [ownerLink, ...unexpectedOwnerLinks] = ownerLinks;

    if (!ownerLink) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account with accountId ${this.accountId} has no linked owner entity`,
      );
    }

    if (unexpectedOwnerLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.entityId} in account ${this.accountId} has more than one linked owner entity`,
      );
    }

    return await ownerLink.getDestination(client);
  }
}

export default __Comment;
