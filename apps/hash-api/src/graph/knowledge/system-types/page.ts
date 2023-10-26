import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  BlockDataProperties,
  ContainsProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  OwnedById,
} from "@local/hash-subgraph";
import {
  getEntities,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { ApolloError } from "apollo-server-errors";
import { generateKeyBetween } from "fractional-indexing";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
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
} from "../primitive/link-entity";
import {
  Block,
  createBlock,
  getBlockComments,
  getBlockFromEntity,
} from "./block";
import { addBlockToBlockCollection } from "./block-collection";
import { Comment } from "./comment";

export type Page = {
  title: string;
  summary?: string;
  fractionalIndex?: string;
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
      SYSTEM_TYPES.entityType.page.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const title = entity.properties[
    SYSTEM_TYPES.propertyType.title.metadata.recordId.baseUrl
  ] as string;

  const summary = entity.properties[
    SYSTEM_TYPES.propertyType.summary.metadata.recordId.baseUrl
  ] as string | undefined;

  const fractionalIndex = entity.properties[
    SYSTEM_TYPES.propertyType.fractionalIndex.metadata.recordId.baseUrl
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
    fractionalIndex,
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
> = async (ctx, authentication, params) => {
  const { entityId } = params;

  const entity = await getLatestEntityById(ctx, authentication, {
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
    prevFractionalIndex?: string;
    initialBlocks?: Block[];
  },
  Promise<Page>
> = async (ctx, authentication, params): Promise<Page> => {
  const { title, summary, prevFractionalIndex, ownedById } = params;

  const fractionalIndex = generateKeyBetween(prevFractionalIndex ?? null, null);

  const properties: EntityPropertiesObject = {
    [SYSTEM_TYPES.propertyType.title.metadata.recordId.baseUrl]: title,
    ...(summary
      ? {
          [SYSTEM_TYPES.propertyType.summary.metadata.recordId.baseUrl]:
            summary,
        }
      : {}),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- account for old browsers
    ...(fractionalIndex !== undefined
      ? {
          [SYSTEM_TYPES.propertyType.fractionalIndex.metadata.recordId.baseUrl]:
            fractionalIndex,
        }
      : {}),
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById,
    properties,
    entityTypeId: SYSTEM_TYPES.entityType.page.schema.$id,
  });

  const page = getPageFromEntity({ entity });

  const initialBlocks =
    params.initialBlocks && params.initialBlocks.length > 0
      ? params.initialBlocks
      : [
          await createBlock(ctx, authentication, {
            ownedById,
            componentId: paragraphBlockComponentId,
            blockData: await createEntity(ctx, authentication, {
              ownedById,
              properties: {
                [SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl]:
                  [],
              },
              entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
            }),
          }),
        ];

  for (const block of initialBlocks) {
    await addBlockToBlockCollection(ctx, authentication, {
      blockCollectionEntity: page.entity,
      block,
    });
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
> = async (ctx, authentication, { page }) => {
  const parentPageLinks = await getEntityOutgoingLinks(ctx, authentication, {
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

  const pageEntity = await getLinkEntityRightEntity(ctx, authentication, {
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
> = async (ctx, authentication, { page }) => {
  if (page.archived) {
    return true;
  }

  const parentPage = await getPageParentPage(ctx, authentication, { page });

  return parentPage
    ? await isPageArchived(ctx, authentication, { page: parentPage })
    : false;
};

/**
 * Get all the pages in a workspace.
 *
 * @param params.workspace - the user or org whose pages will be returned
 */
export const getAllPagesInWorkspace: ImpureGraphFunction<
  {
    ownedById: OwnedById;
    includeArchived?: boolean;
  },
  Promise<Page[]>
> = async (ctx, authentication, params) => {
  const { graphApi } = ctx;
  const { ownedById, includeArchived = false } = params;
  const pageEntities = await graphApi
    .getEntitiesByQuery(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.page.schema.$id,
            // ignoreParents assumes we don't have types which are children of Page which should be returned here
            { ignoreParents: true },
          ),
          {
            equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getEntities(subgraph);
    });

  const pages = pageEntities.map((entity) => getPageFromEntity({ entity }));

  return await Promise.all(
    pages.map(async (page) => {
      if (
        !includeArchived &&
        (await isPageArchived(ctx, authentication, { page }))
      ) {
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
> = async (ctx, authentication, params) => {
  const { page, parentPage } = params;

  if (
    page.entity.metadata.recordId.entityId ===
    parentPage.entity.metadata.recordId.entityId
  ) {
    throw new Error("A page cannot be the parent of itself");
  }

  const actualParentPage = await getPageParentPage(ctx, authentication, {
    page,
  });

  if (!actualParentPage) {
    return false;
  }

  if (
    actualParentPage.entity.metadata.recordId.entityId ===
    page.entity.metadata.recordId.entityId
  ) {
    return true;
  }

  return pageHasParentPage(ctx, authentication, {
    page: actualParentPage,
    parentPage,
  });
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
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const { page } = params;
  const parentPageLinks = await getEntityOutgoingLinks(ctx, authentication, {
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

  await archiveEntity(ctx, authentication, { entity: parentPageLink });
};

/**
 * Set (or unset) the parent page of this page.
 *
 * @param params.page - the page
 * @param params.parentPage - the new parent page (or `null`)
 * @param params.actorId - the account that is setting the parent page
 * @param params.prevFractionalIndex - the fractionalIndex of the previous page
 * @param params.nextIndex- the fractionalIndex of the next page
 */
export const setPageParentPage: ImpureGraphFunction<
  {
    page: Page;
    parentPage: Page | null;

    prevFractionalIndex: string | null;
    nextIndex: string | null;
  },
  Promise<Page>
> = async (ctx, authentication, params) => {
  const { page, parentPage, prevFractionalIndex, nextIndex } = params;

  const newIndex = generateKeyBetween(prevFractionalIndex, nextIndex);

  const existingParentPage = await getPageParentPage(ctx, authentication, {
    page,
  });

  if (existingParentPage) {
    await removeParentPage(ctx, authentication, { page });
  }

  if (parentPage) {
    // Check whether adding the parent page would create a cycle
    if (
      await pageHasParentPage(ctx, authentication, {
        page: parentPage,
        parentPage: page,
      })
    ) {
      throw new ApolloError(
        `Could not set '${parentPage.entity.metadata.recordId.entityId}' as parent of '${page.entity.metadata.recordId.entityId}', this would create a cyclic dependency.`,
        "CYCLIC_TREE",
      );
    }

    await createLinkEntity(ctx, authentication, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
      leftEntityId: page.entity.metadata.recordId.entityId,
      rightEntityId: parentPage.entity.metadata.recordId.entityId,
      ownedById: authentication.actorId as OwnedById,
    });
  }

  if (page.fractionalIndex !== newIndex) {
    const updatedPageEntity = await updateEntityProperty(ctx, authentication, {
      entity: page.entity,
      propertyTypeBaseUrl:
        SYSTEM_TYPES.propertyType.fractionalIndex.metadata.recordId.baseUrl,
      value: newIndex,
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
  Promise<{ linkEntity: LinkEntity<BlockDataProperties>; rightEntity: Block }[]>
> = async (ctx, authentication, { pageEntityId }) => {
  const outgoingBlockDataLinks = (await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: pageEntityId,
      linkEntityTypeVersionedUrl:
        SYSTEM_TYPES.linkEntityType.contains.schema.$id,
    },
  )) as LinkEntity<ContainsProperties>[];

  return await Promise.all(
    outgoingBlockDataLinks
      .sort((a, b) => {
        const { numericIndex: aNumericIndex } = simplifyProperties(
          a.properties,
        );
        const { numericIndex: bNumericIndex } = simplifyProperties(
          b.properties,
        );

        return (
          (aNumericIndex ?? 0) - (bNumericIndex ?? 0) ||
          a.metadata.recordId.entityId.localeCompare(
            b.metadata.recordId.entityId,
          ) ||
          a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
            b.metadata.temporalVersioning.decisionTime.start.limit,
          )
        );
      })
      .map(async (linkEntity) => ({
        linkEntity,
        rightEntity: await getLinkEntityRightEntity(ctx, authentication, {
          linkEntity,
        }).then((entity) => getBlockFromEntity({ entity })),
      })),
  );
};

/**
 * Get the comments in this page's blocks.
 *
 * @param params.page - the page
 */
export const getPageComments: ImpureGraphFunction<
  { pageEntityId: EntityId },
  Promise<Comment[]>
> = async (ctx, authentication, { pageEntityId }) => {
  const blocks = await getPageBlocks(ctx, authentication, {
    pageEntityId,
  });

  const comments = await Promise.all(
    blocks.map(({ rightEntity }) =>
      getBlockComments(ctx, authentication, { block: rightEntity }),
    ),
  );

  return comments
    .flat()
    .filter((comment) => !comment.resolvedAt && !comment.deletedAt);
};
