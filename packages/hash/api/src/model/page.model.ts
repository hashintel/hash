import { UserInputError } from "apollo-server-express";
import {
  Block,
  Entity,
  EntityConstructorArgs,
  EntityExternalResolvers,
  Page,
  UnresolvedGQLEntityType,
  User,
} from ".";
import { DBClient } from "../db";
import {
  DbBlockProperties,
  DbPageProperties,
  DbTextProperties,
  EntityType,
} from "../db/adapter";
import {
  SystemTypeName,
  Page as GQLPage,
  LinkedEntityDefinition,
} from "../graphql/apiTypes.gen";
import { SystemType } from "../types/entityTypes";

export type PageExternalResolvers =
  | EntityExternalResolvers
  | "contents" // contents resolved in `src/graphql/resolvers/pages/linkedEntities.ts`
  | "properties"; // properties.contents is deprecated, and resolved seperately.

export type UnresolvedGQLPage = Omit<GQLPage, PageExternalResolvers> & {
  entityType: UnresolvedGQLEntityType;
  properties: Omit<GQLPage["properties"], "contents">;
};

export type PageConstructorArgs = {
  properties: DbPageProperties;
  outgoingEntityIds?: string[];
} & EntityConstructorArgs;

class __Page extends Entity {
  properties: DbPageProperties;

  parentEntityId?: string;

  constructor(args: PageConstructorArgs) {
    super(args);
    this.properties = args.properties;
    this.parentEntityId = args.outgoingEntityIds?.[0] ?? undefined;
  }

  static async getEntityType(client: DBClient): Promise<EntityType> {
    const pageEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "Page",
    });
    return pageEntityType;
  }

  static async createPage(
    client: DBClient,
    params: {
      createdBy: User;
      accountId: string;
      properties: DbPageProperties;
      initialLinkedContents?: {
        accountId: string;
        entityId: string;
      }[];
    },
  ): Promise<Page> {
    /**
     * @todo: generate all of the entity IDs up-front and create all entities below
     * concurrently (may need to defer FK constraints).
     */

    const {
      createdBy,
      properties: pageProperties,
      accountId,
      initialLinkedContents,
    } = params;

    const blockProperties: DbBlockProperties = {
      componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
    };

    const textProperties: DbTextProperties = {
      tokens: [],
    };

    const linkedEntities: LinkedEntityDefinition[] =
      initialLinkedContents && initialLinkedContents.length > 0
        ? initialLinkedContents.map(
            ({ accountId: destinationAccountId, entityId }, index) => ({
              destinationAccountId,
              path: "$.contents",
              index,
              entity: {
                existingEntity: { accountId: destinationAccountId, entityId },
              },
            }),
          )
        : [
            {
              destinationAccountId: accountId,
              path: "$.contents",
              index: 0,
              entity: {
                entityProperties: blockProperties,
                entityType: {
                  systemTypeName: SystemTypeName.Block,
                },
                linkedEntities: [
                  {
                    path: "$.data",
                    destinationAccountId: accountId,
                    entity: {
                      entityType: {
                        systemTypeName: SystemTypeName.Text,
                      },
                      entityProperties: textProperties,
                    },
                  },
                ],
              },
            },
          ];

    const entity = await Entity.createEntityWithLinks(client, {
      user: createdBy,
      accountId,
      entityDefinition: {
        entityProperties: pageProperties,
        versioned: true,
        entityType: {
          systemTypeName: SystemTypeName.Page,
        },
        linkedEntities,
      },
    });

    return new Page({ ...entity, properties: pageProperties });
  }

  static async getPageById(
    client: DBClient,
    params: { accountId: string; entityId: string },
  ): Promise<Page | null> {
    const { accountId, entityId } = params;
    const dbPage = await client.getEntityLatestVersion({
      accountId,
      entityId,
    });

    if (dbPage?.entityTypeId !== (await this.getEntityType(client)).entityId) {
      return null;
    }

    return new Page(dbPage);
  }

  static async getAccountPagesWithParents(
    client: DBClient,
    params: {
      accountId: string;
      systemTypeName: SystemType;
    },
  ): Promise<Page[]> {
    const dbEntities = await client.getEntitiesByTypeWithOutgoingEntityIds(
      params,
    );

    return dbEntities.map((dbEntity) => new Page(dbEntity));
  }

  static async getAccountPageWithParents(
    client: DBClient,
    params: {
      accountId: string;
      entityId: string;
    },
  ): Promise<Page | null> {
    const dbEntity = await client.getEntityWithOutgoingEntityIds(params);
    return dbEntity ? new Page(dbEntity) : null;
  }

  async getBlocks(client: DBClient): Promise<Block[]> {
    const contentLinks = await this.getOutgoingLinks(client, {
      path: ["contents"],
    });

    const blocks = await Promise.all(
      contentLinks.map(async (link) => {
        const destinationEntity = await link.getDestination(client);
        return await Block.fromEntity(client, destinationEntity);
      }),
    );

    return blocks;
  }

  async insertBlock(
    client: DBClient,
    params: {
      block: Block;
      insertedByAccountId: string;
      position?: number;
    },
  ) {
    const { position: specifiedPosition } = params;

    const contentLinks = await this.getOutgoingLinks(client, {
      path: ["contents"],
    });

    if (
      specifiedPosition !== undefined &&
      (specifiedPosition < 0 || specifiedPosition > contentLinks.length)
    ) {
      throw new UserInputError(`invalid position: ${specifiedPosition}`);
    }

    const { block, insertedByAccountId } = params;

    await this.createOutgoingLink(client, {
      destination: block,
      stringifiedPath: "$.contents",
      createdByAccountId: insertedByAccountId,
      index: specifiedPosition ?? contentLinks.length,
    });

    /** @todo: remove when modifying links no longer creates new versions of the source entity */
    await this.refetchLatestVersion(client);
  }

  async moveBlock(
    client: DBClient,
    params: {
      currentPosition: number;
      newPosition: number;
      movedByAccountId: string;
    },
  ) {
    const { currentPosition, newPosition } = params;

    const contentLinks = await this.getOutgoingLinks(client, {
      path: ["contents"],
    });

    if (currentPosition < 0 || currentPosition >= contentLinks.length) {
      throw new UserInputError(
        `invalid currentPosition: ${params.currentPosition}`,
      );
    }
    if (newPosition < 0 || newPosition >= contentLinks.length) {
      throw new UserInputError(`invalid newPosition: ${params.newPosition}`);
    }

    const link = contentLinks.find(({ index }) => index === currentPosition);

    if (!link) {
      throw new Error(
        `Critical: could not find contents link with index ${currentPosition} for page with entityId ${this.entityId} in account ${this.accountId}`,
      );
    }

    const { movedByAccountId } = params;

    await link.update(client, {
      updatedIndex: newPosition,
      updatedByAccountId: movedByAccountId,
    });

    /** @todo: remove when modifying links no longer creates new versions of the source entity */
    await this.refetchLatestVersion(client);
  }

  async removeBlock(
    client: DBClient,
    params: { position: number; removedByAccountId: string },
  ) {
    const { position } = params;

    const contentLinks = await this.getOutgoingLinks(client, {
      path: ["contents"],
    });

    if (position < 0 || position >= contentLinks.length) {
      throw new UserInputError(`invalid position: ${position}`);
    }

    const link = contentLinks.find(({ index }) => index === position);

    if (!link) {
      throw new Error(
        `Critical: could not find contents link with index ${position} for page with entityId ${this.entityId} in account ${this.accountId}`,
      );
    }

    if (contentLinks.length === 1) {
      throw new Error("Cannot remove final block from page");
    }

    const { removedByAccountId } = params;

    await link.delete(client, { deletedByAccountId: removedByAccountId });

    /** @todo: remove when modifying links no longer creates new versions of the source entity */
    await this.refetchLatestVersion(client);
  }

  toGQLPageEntity(): UnresolvedGQLPage {
    return {
      ...this.toGQLEntity(),
      parentPageId: this.parentEntityId,
      properties: this.properties,
    };
  }
}

export default __Page;
