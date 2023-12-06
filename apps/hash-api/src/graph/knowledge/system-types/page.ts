import { sortBlockCollectionLinks } from "@local/hash-isomorphic-utils/block-collection";
import { getFirstEntityRevision } from "@local/hash-isomorphic-utils/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  isPageEntityTypeId,
  pageEntityTypeFilter,
  pageEntityTypeIds,
} from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { HasSpatiallyPositionedContentProperties } from "@local/hash-isomorphic-utils/system-types/canvas";
import {
  HasDataProperties,
  HasIndexedContentProperties,
  PageProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityRootType,
  EntityUuid,
  extractEntityUuidFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";
import {
  getEntities as getEntitiesFromSubgraph,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";
import { ApolloError } from "apollo-server-errors";
import { generateKeyBetween } from "fractional-indexing";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import {
  archiveEntity,
  createEntity,
  CreateEntityParams,
  getEntities,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntityProperty,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import { Block, getBlockComments, getBlockFromEntity } from "./block";
import { addBlockToBlockCollection } from "./block-collection";
import { Comment } from "./comment";
import { getUserById, User } from "./user";

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
  if (!isPageEntityTypeId(entity.metadata.entityTypeId)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      pageEntityTypeIds,
      entity.metadata.entityTypeId,
    );
  }

  const { title, summary, fractionalIndex, icon, archived } =
    simplifyProperties(entity.properties as PageProperties);

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
    type: "canvas" | "document";
  },
  Promise<Page>
> = async (ctx, authentication, params): Promise<Page> => {
  const { title, type, summary, prevFractionalIndex, ownedById } = params;

  const fractionalIndex = generateKeyBetween(prevFractionalIndex ?? null, null);

  const properties: PageProperties = {
    "https://hash.ai/@hash/types/property-type/title/": title,
    "https://hash.ai/@hash/types/property-type/fractional-index/":
      fractionalIndex,
    ...(summary
      ? {
          "https://hash.ai/@hash/types/property-type/summary/": summary,
        }
      : {}),
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById,
    properties,
    entityTypeId:
      type === "document"
        ? systemEntityTypes.document.entityTypeId
        : systemEntityTypes.canvas.entityTypeId,
  });

  const page = getPageFromEntity({ entity });

  for (const block of params.initialBlocks ?? []) {
    await addBlockToBlockCollection(ctx, authentication, {
      blockCollectionEntityId: page.entity.metadata.recordId.entityId,
      block,
      position:
        type === "document"
          ? {
              indexPosition: {
                "https://hash.ai/@hash/types/property-type/fractional-index/":
                  generateKeyBetween(null, null),
              },
            }
          : {
              canvasPosition: {
                "https://hash.ai/@hash/types/property-type/x-position/": 0,
                "https://hash.ai/@hash/types/property-type/y-position/": 0,
                "https://hash.ai/@hash/types/property-type/width-in-pixels/": 500,
                "https://hash.ai/@hash/types/property-type/height-in-pixels/": 200,
                "https://hash.ai/@hash/types/property-type/rotation-in-rads/": 0,
              },
            },
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
    linkEntityTypeVersionedUrl:
      systemLinkEntityTypes.hasParent.linkEntityTypeId,
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
    includeDrafts?: boolean;
  },
  Promise<Page[]>
> = async (ctx, authentication, params) => {
  const { graphApi } = ctx;
  const { ownedById, includeArchived = false, includeDrafts = false } = params;
  const pageEntities = await graphApi
    .getEntitiesByQuery(authentication.actorId, {
      filter: {
        all: [
          pageEntityTypeFilter,
          {
            equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getEntitiesFromSubgraph(subgraph);
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
    linkEntityTypeVersionedUrl:
      systemLinkEntityTypes.hasParent.linkEntityTypeId,
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
      linkEntityTypeId: systemLinkEntityTypes.hasParent.linkEntityTypeId,
      leftEntityId: page.entity.metadata.recordId.entityId,
      rightEntityId: parentPage.entity.metadata.recordId.entityId,
      ownedById: authentication.actorId as OwnedById,
    });
  }

  if (page.fractionalIndex !== newIndex) {
    const updatedPageEntity = await updateEntityProperty(ctx, authentication, {
      entity: page.entity,
      propertyTypeBaseUrl: extractBaseUrl(
        systemPropertyTypes.fractionalIndex.propertyTypeId,
      ),
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
  { pageEntityId: EntityId; type: "canvas" | "document" },
  Promise<{ linkEntity: LinkEntity<HasDataProperties>; rightEntity: Block }[]>
> = async (ctx, authentication, { pageEntityId, type }) => {
  const outgoingBlockDataLinks = (await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: pageEntityId,
      linkEntityTypeVersionedUrl:
        type === "document"
          ? systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId
          : systemLinkEntityTypes.hasSpatiallyPositionedContent
              .linkEntityTypeId,
    },
  )) as
    | LinkEntity<HasIndexedContentProperties>[]
    | LinkEntity<HasSpatiallyPositionedContentProperties>[];

  return await Promise.all(
    outgoingBlockDataLinks
      .sort(sortBlockCollectionLinks)
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
    type: "document", // @todo this will need updating to implement commenting on canvas pages
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

/**
 * Get the author of the page (i.e. the creator of the first revision).
 *
 * @param params.page - the page
 */
export const getPageAuthor: ImpureGraphFunction<
  { pageEntityId: EntityId; includeDrafts?: boolean },
  Promise<User>
> = async (context, authentication, params) => {
  const { pageEntityId, includeDrafts = false } = params;

  const pageEntityRevisionsSubgraph = await getEntities(
    context,
    authentication,
    {
      query: {
        filter: {
          all: [
            {
              equal: [
                { path: ["uuid"] },
                { parameter: extractEntityUuidFromEntityId(pageEntityId) },
              ],
            },
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: {
          pinned: { axis: "transactionTime", timestamp: null },
          variable: {
            axis: "decisionTime",
            interval: { start: { kind: "unbounded" }, end: null },
          },
        },
        includeDrafts,
      },
    },
  );

  const firstRevision = getFirstEntityRevision(
    pageEntityRevisionsSubgraph,
    pageEntityId,
  );

  const firstRevisionCreatorId =
    firstRevision.metadata.provenance.recordCreatedById;

  const user = await getUserById(context, authentication, {
    entityId: entityIdFromOwnedByIdAndEntityUuid(
      firstRevisionCreatorId as Uuid as OwnedById,
      firstRevisionCreatorId as Uuid as EntityUuid,
    ),
  });

  return user;
};
