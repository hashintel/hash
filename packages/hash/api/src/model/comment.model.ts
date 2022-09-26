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

export type CommentExternalResolvers = EntityExternalResolvers | "tokens"; // tokens resolved in `src/graphql/resolvers/Comments/linkedEntities.ts`

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
      tokens: TextToken[];
    },
  ): Promise<Comment> {
    const { createdBy, parent, accountId, tokens } = params;

    const textProperties: DbTextProperties = {
      tokens,
    };

    const linkedEntities: LinkedEntityDefinition[] = [
      {
        path: "$.tokens",
        destinationAccountId: accountId,
        entity: {
          entityType: {
            systemTypeName: SystemTypeName.Text,
          },
          entityProperties: textProperties,
        },
      },
      {
        path: "$.author",
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

    const entity = await Entity.createEntityWithLinks(client, {
      user: createdBy,
      accountId,
      entityDefinition: {
        entityProperties: {},
        versioned: true,
        entityType: {
          systemTypeName: SystemTypeName.Comment,
        },
        linkedEntities,
      },
    });

    return new Comment(entity);
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

  async getTokens(client: DbClient): Promise<Entity> {
    const tokensLinks = await this.getOutgoingLinks(client, {
      path: ["tokens"],
    });

    const [tokensLink, ...unexpectedTokensLinks] = tokensLinks;

    if (!tokensLink) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account with accountId ${this.accountId} has no linked tokens entity`,
      );
    }
    if (unexpectedTokensLinks.length > 0) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account with accountId ${this.accountId} has more than one linked tokens entity`,
      );
    }

    return tokensLink.getDestination(client);
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

  async getAuthor(client: DbClient): Promise<Entity> {
    const authorLinks = await this.getOutgoingLinks(client, {
      path: ["author"],
    });

    const [authorLink, ...unexpectedAuthorLinks] = authorLinks;

    if (!authorLink) {
      throw new Error(
        `Critical: comment with entityId ${this.entityId} in account with accountId ${this.accountId} has no linked author entity`,
      );
    }

    if (unexpectedAuthorLinks.length > 0) {
      throw new Error(
        `Critical: Comment with entityId ${this.entityId} in account ${this.accountId} has more than one linked author entity`,
      );
    }

    return await authorLink.getDestination(client);
  }
}

export default __Comment;
