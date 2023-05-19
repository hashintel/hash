import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import {
  AccountId,
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  extractOwnedByIdFromEntityId,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getEntities } from "@local/hash-subgraph/stdlib";
import { ApolloError, UserInputError } from "apollo-server-errors";
import { generateKeyBetween } from "fractional-indexing";

import { EntityTypeMismatchError } from "../../../lib/error";
import {
  currentTimeInstantTemporalAxes,
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import {
  archiveEntity,
  createEntity,
  CreateEntityParams,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntityProperty,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityRightEntity,
  LinkEntity,
  updateLinkEntity,
} from "../primitive/link-entity";
import {
  Block,
  createBlock,
  getBlockComments,
  getBlockFromEntity,
} from "./block";
import { Comment } from "./comment";
import { Org } from "./org";
import { User } from "./user";

export type Page = {
  title: string;
  summary?: string;
  index?: string;
  icon?: string;
  archived?: boolean;
  entity: Entity;
};

export const getPageFromEntity: PureGraphFunction<{ entity: Entity }, Page> = ({
  entity,
}) => {
  if (
    entity.metadata.entityTypeId !== SYSTEM_TYPES.entityType.page.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.block.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const title = entity.properties[
    SYSTEM_TYPES.propertyType.title.metadata.recordId.baseUrl
  ] as string;

  const summary = entity.properties[
    SYSTEM_TYPES.propertyType.summary.metadata.recordId.baseUrl
  ] as string | undefined;

  const index = entity.properties[
    SYSTEM_TYPES.propertyType.index.metadata.recordId.baseUrl
  ] as string | undefined;

  const icon = entity.properties[
    SYSTEM_TYPES.propertyType.icon.metadata.recordId.baseUrl
  ] as string | undefined;

  const archived = entity.properties[
    SYSTEM_TYPES.propertyType.archived.metadata.recordId.baseUrl
  ] as boolean | undefined;

  return {
    title,
    summary,
    index,
    icon,
    archived,
    entity,
  };
};

/**
 * Get a system page entity by its entity id.
 *
 * @param params.entityId - the entity id of the page
 */
export const getPageById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<Page>
> = async (ctx, params) => {
  const { entityId } = params;

  const entity = await getLatestEntityById(ctx, {
    entityId,
  });

  return getPageFromEntity({ entity });
};

/**
 * Create a system page entity.
 *
 * @param params.title - the title of the page
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const createPage: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    title: string;
    summary?: string;
    prevIndex?: string;
    initialBlocks?: Block[];
  },
  Promise<Page>
> = async (ctx, params): Promise<Page> => {
  const { title, summary, prevIndex, ownedById, actorId } = params;

  const index = generateKeyBetween(prevIndex ?? null, null);

  const properties: EntityPropertiesObject = {
    [SYSTEM_TYPES.propertyType.title.metadata.recordId.baseUrl]: title,
    ...(summary
      ? {
          [SYSTEM_TYPES.propertyType.summary.metadata.recordId.baseUrl]:
            summary,
        }
      : {}),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- account for old browsers
    ...(index !== undefined
      ? { [SYSTEM_TYPES.propertyType.index.metadata.recordId.baseUrl]: index }
      : {}),
  };

  const entity = await createEntity(ctx, {
    ownedById,
    properties,
    entityTypeId: SYSTEM_TYPES.entityType.page.schema.$id,
    actorId,
  });

  const page = getPageFromEntity({ entity });

  const initialBlocks =
    params.initialBlocks && params.initialBlocks.length > 0
      ? params.initialBlocks
      : [
          await createBlock(ctx, {
            ownedById,
            componentId: paragraphBlockComponentId,
            blockData: await createEntity(ctx, {
              ownedById,
              properties: {
                [SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl]:
                  [],
              },
              entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
              actorId,
            }),
            actorId,
          }),
        ];

  for (const block of initialBlocks) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await addBlockToPage(ctx, { page, block, actorId });
  }

  return page;
};

/**
 * Get the parent page of the page.
 *
 * @param params.page - the page
 */
export const getPageParentPage: ImpureGraphFunction<
  { page: Page },
  Promise<Page | null>
> = async (ctx, { page }) => {
  const parentPageLinks = await getEntityOutgoingLinks(ctx, {
    entityId: page.entity.metadata.recordId.entityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.parent.schema.$id,
  });

  const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

  if (unexpectedParentPageLinks.length > 0) {
    throw new Error(
      `Critical: Page with entity ID ${page.entity.metadata.recordId.entityId} has more than one parent page`,
    );
  }

  if (!parentPageLink) {
    return null;
  }

  const pageEntity = await getLinkEntityRightEntity(ctx, {
    linkEntity: parentPageLink,
  });

  return getPageFromEntity({ entity: pageEntity });
};

/**
 * Whether or not the page (or an ancestor of the page) is archived.
 *
 * @param params.page - the page
 */
export const isPageArchived: ImpureGraphFunction<
  { page: Page },
  Promise<boolean>
> = async (ctx, { page }) => {
  if (page.archived) {
    return true;
  }

  const parentPage = await getPageParentPage(ctx, { page });

  return parentPage ? await isPageArchived(ctx, { page: parentPage }) : false;
};

/**
 * Get all the pages in a workspace.
 *
 * @param params.workspace - the user or org whose pages will be returned
 */
export const getAllPagesInWorkspace: ImpureGraphFunction<
  {
    workspace: User | Org;
  },
  Promise<Page[]>
> = async (ctx, params) => {
  const { graphApi } = ctx;
  const pageEntities = await graphApi
    .getEntitiesByQuery({
      filter: {
        equal: [
          { path: ["type", "versionedUrl"] },
          { parameter: SYSTEM_TYPES.entityType.page.schema.$id },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data: subgraph }) =>
      getEntities(subgraph as Subgraph<EntityRootType>),
    );

  const pages = pageEntities
    /**
     * @todo: filter the pages by their ownedById in the query instead once it's supported
     * @see https://app.asana.com/0/1202805690238892/1203015527055374/f
     */
    .filter(
      (pageEntity) =>
        extractOwnedByIdFromEntityId(pageEntity.metadata.recordId.entityId) ===
        params.workspace.accountId,
    )
    .map((entity) => getPageFromEntity({ entity }));

  return await Promise.all(
    pages.map(async (page) => {
      if (await isPageArchived(ctx, { page })) {
        return [];
      }
      return page;
    }),
  ).then((filteredPages) => filteredPages.flat());
};

/**
 * Whether a page (or an ancestor of the page) has a specific page as its parent.
 *
 * @param params.page - the page.
 * @param params.parentPage - the page that may or not be the parent of this page.
 */
export const pageHasParentPage: ImpureGraphFunction<
  {
    page: Page;
    parentPage: Page;
  },
  Promise<boolean>
> = async (ctx, params) => {
  const { page, parentPage } = params;

  if (
    page.entity.metadata.recordId.entityId ===
    parentPage.entity.metadata.recordId.entityId
  ) {
    throw new Error("A page cannot be the parent of itself");
  }

  const actualParentPage = await getPageParentPage(ctx, { page });

  if (!actualParentPage) {
    return false;
  }

  if (
    actualParentPage.entity.metadata.recordId.entityId ===
    page.entity.metadata.recordId.entityId
  ) {
    return true;
  }

  return pageHasParentPage(ctx, { page: actualParentPage, parentPage });
};

/**
 * Remove the current parent page of the page.
 *
 * @param params.page - the page
 * @param params.removedById - the account that is removing the parent page
 */
export const removeParentPage: ImpureGraphFunction<
  {
    page: Page;
    actorId: AccountId;
  },
  Promise<void>
> = async (ctx, params) => {
  const { page } = params;
  const parentPageLinks = await getEntityOutgoingLinks(ctx, {
    entityId: page.entity.metadata.recordId.entityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.parent.schema.$id,
  });

  const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

  if (unexpectedParentPageLinks.length > 0) {
    throw new Error(
      `Critical: Page with entityId ${page.entity.metadata.recordId.entityId} has more than one parent page`,
    );
  }

  if (!parentPageLink) {
    throw new Error(
      `Page with entityId ${page.entity.metadata.recordId.entityId} does not have a parent page`,
    );
  }

  const { actorId } = params;

  await archiveEntity(ctx, { entity: parentPageLink, actorId });
};

/**
 * Set (or unset) the parent page of this page.
 *
 * @param params.page - the page
 * @param params.parentPage - the new parent page (or `null`)
 * @param params.actorId - the account that is setting the parent page
 * @param params.prevIndex - the index of the previous page
 * @param params.nextIndex- the index of the next page
 */
export const setPageParentPage: ImpureGraphFunction<
  {
    page: Page;
    parentPage: Page | null;
    actorId: AccountId;
    prevIndex: string | null;
    nextIndex: string | null;
  },
  Promise<Page>
> = async (ctx, params) => {
  const { actorId, page, parentPage, prevIndex, nextIndex } = params;

  const newIndex = generateKeyBetween(prevIndex, nextIndex);

  const existingParentPage = await getPageParentPage(ctx, { page });

  if (existingParentPage) {
    await removeParentPage(ctx, { page, actorId });
  }

  if (parentPage) {
    // Check whether adding the parent page would create a cycle
    if (await pageHasParentPage(ctx, { page: parentPage, parentPage: page })) {
      throw new ApolloError(
        `Could not set '${parentPage.entity.metadata.recordId.entityId}' as parent of '${page.entity.metadata.recordId.entityId}', this would create a cyclic dependency.`,
        "CYCLIC_TREE",
      );
    }

    await createLinkEntity(ctx, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
      leftEntityId: page.entity.metadata.recordId.entityId,
      rightEntityId: parentPage.entity.metadata.recordId.entityId,
      ownedById: actorId as OwnedById,
      actorId,
    });
  }

  if (page.index !== newIndex) {
    const updatedPageEntity = await updateEntityProperty(ctx, {
      entity: page.entity,
      propertyTypeBaseUrl:
        SYSTEM_TYPES.propertyType.index.metadata.recordId.baseUrl,
      value: newIndex,
      actorId,
    });

    return getPageFromEntity({ entity: updatedPageEntity });
  }

  return page;
};

/**
 * Get the blocks in this page.
 *
 * @param params.page - the page
 */
export const getPageBlocks: ImpureGraphFunction<
  { pageEntityId: EntityId },
  Promise<{ linkEntity: LinkEntity; rightEntity: Block }[]>
> = async (ctx, { pageEntityId }) => {
  const outgoingBlockDataLinks = await getEntityOutgoingLinks(ctx, {
    entityId: pageEntityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.contains.schema.$id,
  });

  return await Promise.all(
    outgoingBlockDataLinks
      .sort(
        (a, b) =>
          (a.linkData.leftToRightOrder ?? 0) -
            (b.linkData.leftToRightOrder ?? 0) ||
          a.metadata.recordId.entityId.localeCompare(
            b.metadata.recordId.entityId,
          ) ||
          a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
            b.metadata.temporalVersioning.decisionTime.start.limit,
          ),
      )
      .map(async (linkEntity) => ({
        linkEntity,
        rightEntity: await getLinkEntityRightEntity(ctx, { linkEntity }).then(
          (entity) => getBlockFromEntity({ entity }),
        ),
      })),
  );
};

/**
 * Insert a block into this page
 *
 * @param params.block - the block to insert in the page
 * @param params.position (optional) - the position of the block in the page
 * @param params.insertedById - the id of the account that is inserting the block into the page
 */
export const addBlockToPage: ImpureGraphFunction<
  {
    page: Page;
    block: Block;
    canvasPosition?: CanvasPosition;
    position?: number;
    actorId: AccountId;
  },
  Promise<void>
> = async (ctx, params) => {
  const {
    position: specifiedPosition,
    canvasPosition,
    actorId,
    page,
    block,
  } = params;

  await createLinkEntity(ctx, {
    leftEntityId: page.entity.metadata.recordId.entityId,
    rightEntityId: block.entity.metadata.recordId.entityId,
    linkEntityType: SYSTEM_TYPES.linkEntityType.contains,
    leftToRightOrder:
      specifiedPosition ??
      // if position is not specified and there are no blocks currently in the page, specify the index of the link is `0`
      ((
        await getPageBlocks(ctx, {
          pageEntityId: page.entity.metadata.recordId.entityId,
        })
      ).length === 0
        ? 0
        : undefined),
    // assume that link to block is owned by the same account as the page
    ownedById: extractOwnedByIdFromEntityId(
      page.entity.metadata.recordId.entityId,
    ),
    properties: canvasPosition ?? {},
    actorId,
  });
};

/**
 * Move a block in the page from one position to another.
 *
 * @param params.page - the page
 * @param params.currentPosition - the current position of the block being moved
 * @param params.newPosition - the new position of the block being moved
 * @param params.movedById - the id of the account that is moving the block
 */
export const moveBlockInPage: ImpureGraphFunction<
  {
    page: Page;
    canvasPosition?: CanvasPosition;
    currentPosition: number;
    newPosition: number;
    actorId: AccountId;
  },
  Promise<void>
> = async (ctx, params) => {
  const { page, canvasPosition, currentPosition, newPosition, actorId } =
    params;

  const contentLinks = await getEntityOutgoingLinks(ctx, {
    entityId: page.entity.metadata.recordId.entityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.contains.schema.$id,
  });

  if (currentPosition < 0 || currentPosition >= contentLinks.length) {
    throw new UserInputError(
      `invalid currentPosition: ${params.currentPosition}`,
    );
  }
  if (newPosition < 0 || newPosition >= contentLinks.length) {
    throw new UserInputError(`invalid newPosition: ${params.newPosition}`);
  }

  const linkEntity = contentLinks.find(
    ({ linkData }) => linkData.leftToRightOrder === currentPosition,
  );

  if (!linkEntity) {
    throw new Error(
      `Critical: could not find contents link with index ${currentPosition} for page with entityId ${page.entity.metadata.recordId.entityId}`,
    );
  }

  await updateLinkEntity(ctx, {
    properties: {
      ...linkEntity.properties,
      ...canvasPosition,
    },
    linkEntity,
    leftToRightOrder: newPosition,
    actorId,
  });
};

/**
 * Remove a block from the page.
 *
 * @param params.page - the page
 * @param params.position - the position of the block being removed
 * @param params.actorId - the id of the account that is removing the block
 * @param params.allowRemovingFinal (optional) - whether or not removing the final block in the page should be permitted (defaults to `true`)
 */
export const removeBlockFromPage: ImpureGraphFunction<
  {
    page: Page;
    position: number;
    actorId: AccountId;
    allowRemovingFinal?: boolean;
  },
  Promise<void>
> = async (ctx, params) => {
  const { page, allowRemovingFinal = false, position, actorId } = params;

  const contentLinkEntities = await getEntityOutgoingLinks(ctx, {
    entityId: page.entity.metadata.recordId.entityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.contains.schema.$id,
  });

  /**
   * @todo currently the count of outgoing links are not the best indicator of a valid position
   *   as page saving could assume index positions higher than the number of blocks.
   *   Ideally we'd be able to atomically rearrange all blocks as we're removing/adding blocks.
   *   see: https://app.asana.com/0/1200211978612931/1203031430417465/f
   */

  const linkEntity = contentLinkEntities.find(
    (contentLinkEntity) =>
      contentLinkEntity.linkData.leftToRightOrder === position,
  );

  if (!linkEntity) {
    throw new Error(
      `Critical: could not find contents link with index ${position} for page with entity ID ${page.entity.metadata.recordId.entityId}`,
    );
  }

  if (!allowRemovingFinal && contentLinkEntities.length === 1) {
    throw new Error("Cannot remove final block from page");
  }

  await archiveEntity(ctx, { entity: linkEntity, actorId });
};

/**
 * Get the comments in this page's blocks.
 *
 * @param params.page - the page
 */
export const getPageComments: ImpureGraphFunction<
  { page: Page },
  Promise<Comment[]>
> = async (ctx, { page }) => {
  const blocks = await getPageBlocks(ctx, {
    pageEntityId: page.entity.metadata.recordId.entityId,
  });

  const comments = await Promise.all(
    blocks.map(({ rightEntity }) =>
      getBlockComments(ctx, { block: rightEntity }),
    ),
  );

  return comments
    .flat()
    .filter((comment) => !comment.resolvedAt && !comment.deletedAt);
};
