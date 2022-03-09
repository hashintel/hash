import { UserInputError, ApolloError } from "apollo-server-express";
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

export type PageExternalResolvers = EntityExternalResolvers | "contents"; // contents resolved in `src/graphql/resolvers/pages/linkedEntities.ts`

export type UnresolvedGQLPage = Omit<GQLPage, PageExternalResolvers> & {
  entityType: UnresolvedGQLEntityType;
};

export type PageConstructorArgs = {
  properties: DbPageProperties;
  outgoingEntityIds?: string[];
} & EntityConstructorArgs;

class __Page extends Entity {
  properties: DbPageProperties;

  constructor(args: PageConstructorArgs) {
    super(args);
    this.properties = args.properties;
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

    if (dbPage) {
      if (dbPage.entityTypeId !== (await Page.getEntityType(client)).entityId) {
        throw new Error(
          `Entity with entityId ${entityId} in account ${accountId} is not a Page`,
        );
      }
      return new Page(dbPage);
    }

    return null;
  }

  static async getAllPagesInAccount(
    client: DBClient,
    params: {
      accountId: string;
    },
  ): Promise<Page[]> {
    const pageEntities = await Entity.getEntitiesBySystemType(client, {
      accountId: params.accountId,
      systemTypeName: "Page",
      latestOnly: true,
    });

    return await Promise.all(
      pageEntities.map((entity) => Page.fromEntity(client, entity)),
    );
  }

  static async fromEntity(client: DBClient, entity: Entity): Promise<Page> {
    if (
      entity.entityType.entityId !== (await Page.getEntityType(client)).entityId
    ) {
      throw new Error(
        `Entity with entityId ${entity.entityId} does not have the Pag system type as its entity type`,
      );
    }
    return new Page({
      ...entity,
      properties: entity.properties as DbPageProperties,
    });
  }

  async getParentPage(client: DBClient): Promise<Page | null> {
    const parentPageLinks = await this.getOutgoingLinks(client, {
      path: ["parentPage"],
    });

    if (parentPageLinks.length > 1) {
      throw new Error(
        `Critical: Page with entityId ${this.entityId} in account ${this.accountId} has more than one parent page`,
      );
    }
    if (parentPageLinks.length === 0) {
      return null;
    }
    const [parentPageLink] = parentPageLinks;

    const destinationEntity = await parentPageLink.getDestination(client);

    return await Page.fromEntity(client, destinationEntity);
  }

  async hasParentPage(
    client: DBClient,
    params: {
      page: Page;
    },
  ): Promise<boolean> {
    const { page } = params;

    if (this.entityId === page.entityId) {
      throw new Error("A page cannot be the parent of itself");
    }

    const parentPage = await this.getParentPage(client);

    if (!parentPage) {
      return false;
    }

    if (parentPage.entityId === page.entityId) {
      return true;
    }

    return parentPage.hasParentPage(client, params);
  }

  async deleteParentPage(
    client: DBClient,
    params: {
      removedByAccountId: string;
    },
  ): Promise<void> {
    const parentPageLinks = await this.getOutgoingLinks(client, {
      path: ["parentPage"],
    });

    if (parentPageLinks.length > 1) {
      throw new Error(
        `Critical: Page with entityId ${this.entityId} in account ${this.accountId} has more than one parent page`,
      );
    }
    if (parentPageLinks.length === 0) {
      throw new Error(
        `Page with entityId ${this.entityId} in account ${this.accountId} does not have a parent page`,
      );
    }
    const [parentPageLink] = parentPageLinks;

    const { removedByAccountId: deletedByAccountId } = params;

    await this.deleteOutgoingLink(client, {
      linkId: parentPageLink.linkId,
      deletedByAccountId,
    });
  }

  async setParentPage(
    client: DBClient,
    params: {
      parentPage: Page | null;
      setByAccountId: string;
    },
  ): Promise<void> {
    const { setByAccountId } = params;

    const existingParentPage = await this.getParentPage(client);

    if (existingParentPage) {
      await this.deleteParentPage(client, {
        removedByAccountId: setByAccountId,
      });
    }

    const { parentPage } = params;

    if (parentPage) {
      /** Check whether adding the parent page would create a cycle */
      if (await parentPage.hasParentPage(client, { page: this })) {
        throw new ApolloError(
          `Could not set '${parentPage.entityId}' as parent of '${this.entityId}', this would create a cyclic dependency.`,
          "CYCLIC_TREE",
        );
      }

      await this.createOutgoingLink(client, {
        createdByAccountId: setByAccountId,
        stringifiedPath: "$.parentPage",
        destination: parentPage,
      });
    }
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
  }
}

export default __Page;
