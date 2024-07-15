import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type {
  CreateEntityParameters,
  Entity,
  LinkEntity,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { sortBlockCollectionLinks } from "@local/hash-isomorphic-utils/block-collection";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
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
import type {
  Canvas,
  FractionalIndexPropertyValueWithMetadata,
  HasParent,
  HasSpatiallyPositionedContent,
} from "@local/hash-isomorphic-utils/system-types/canvas";
import type { Document } from "@local/hash-isomorphic-utils/system-types/document";
import type { HasIndexedContent } from "@local/hash-isomorphic-utils/system-types/shared";
import { ApolloError } from "apollo-server-errors";
import { generateKeyBetween } from "fractional-indexing";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import {
  createEntity,
  getEntities,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntity,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import type { Block } from "./block";
import { getBlockComments, getBlockFromEntity } from "./block";
import { addBlockToBlockCollection } from "./block-collection";
import type { Comment } from "./comment";

export type Page = {
  title: string;
  summary?: string;
  fractionalIndex?: string;
  icon?: string;
  archived?: boolean;
  entity: Entity<Canvas | Document>;
};

function assertPageEntity(
  entity: Entity,
): asserts entity is Entity<Canvas | Document> {
  if (!isPageEntityTypeId(entity.metadata.entityTypeId)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      pageEntityTypeIds,
      entity.metadata.entityTypeId,
    );
  }
}

export const getPageFromEntity: PureGraphFunction<{ entity: Entity }, Page> = ({
  entity,
}) => {
  assertPageEntity(entity);

  const { title, summary, fractionalIndex, icon, archived } =
    simplifyProperties(entity.properties);

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
  Promise<Page>,
  false,
  true
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
  Pick<CreateEntityParameters, "ownedById"> & {
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

  const properties: (Canvas | Document)["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@hash/types/property-type/title/": {
        value: title,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      "https://hash.ai/@hash/types/property-type/fractional-index/": {
        value: fractionalIndex,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      ...(summary !== undefined
        ? {
            "https://hash.ai/@hash/types/property-type/summary/": {
              value: summary,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          }
        : {}),
    },
  };

  const entity = await createEntity<Canvas | Document>(ctx, authentication, {
    ownedById,
    properties,
    entityTypeId:
      type === "document"
        ? systemEntityTypes.document.entityTypeId
        : systemEntityTypes.canvas.entityTypeId,
    relationships: createDefaultAuthorizationRelationships(authentication),
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
  Promise<Page | null>,
  false,
  true
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
  Promise<boolean>,
  false,
  true
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
  Promise<Page[]>,
  false,
  true
> = async (ctx, authentication, params) => {
  const { ownedById, includeArchived = false, includeDrafts = false } = params;
  const pageEntities = await getEntities(ctx, authentication, {
    filter: {
      all: [
        pageEntityTypeFilter,
        {
          equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
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
  Promise<boolean>,
  false,
  true
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
  Promise<void>,
  false,
  true
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

  await parentPageLink.archive(ctx.graphApi, authentication);
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
  Promise<Page>,
  false,
  true
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

    await createLinkEntity<HasParent>(ctx, authentication, {
      ownedById: authentication.actorId as OwnedById,
      properties: { value: {} },
      linkData: {
        leftEntityId: page.entity.metadata.recordId.entityId,
        rightEntityId: parentPage.entity.metadata.recordId.entityId,
      },
      entityTypeId: systemLinkEntityTypes.hasParent.linkEntityTypeId,
      relationships: createDefaultAuthorizationRelationships(authentication),
    });
  }

  if (page.fractionalIndex !== newIndex) {
    const updatedPageEntity = await updateEntity(ctx, authentication, {
      entity: page.entity,
      propertyPatches: [
        {
          op: "replace",
          path: [systemPropertyTypes.fractionalIndex.propertyTypeBaseUrl],
          property: {
            value: newIndex,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          } satisfies FractionalIndexPropertyValueWithMetadata,
        },
      ],
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
  Promise<
    {
      linkEntity: LinkEntity<HasIndexedContent | HasSpatiallyPositionedContent>;
      rightEntity: Block;
    }[]
  >,
  false,
  true
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
    | LinkEntity<HasIndexedContent>[]
    | LinkEntity<HasSpatiallyPositionedContent>[];

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
  Promise<Comment[]>,
  false,
  true
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
