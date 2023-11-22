import { useQuery } from "@apollo/client";
import { extractBaseUrl } from "@blockprotocol/type-system";
import { HashBlock } from "@local/hash-isomorphic-utils/blocks";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { isSafariBrowser } from "@local/hash-isomorphic-utils/util";
import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, SxProps } from "@mui/material";
import { keyBy } from "lodash";
import { GetServerSideProps } from "next";
import { Router, useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";

import { BlockLoadedProvider } from "../../blocks/on-block-loaded";
import { UserBlocksProvider } from "../../blocks/user-blocks";
import {
  AccountPagesInfo,
  useAccountPages,
} from "../../components/hooks/use-account-pages";
import {
  PageThread,
  usePageComments,
} from "../../components/hooks/use-page-comments";
import { PageIcon } from "../../components/page-icon";
import { PageIconButton } from "../../shared/page-icon-button";
import { PageLoadingState } from "../../components/page-loading-state";
import { CollabPositionProvider } from "../../contexts/collab-position-context";
import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../../lib/apollo-client";
import { constructPageRelativeUrl } from "../../lib/routes";
import {
  constructMinimalOrg,
  constructMinimalUser,
  extractOwnedById,
  isEntityOrgEntity,
  isEntityUserEntity,
  MinimalOrg,
  MinimalUser,
} from "../../lib/user-and-org";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import {
  isPageParsedUrlQuery,
  parsePageUrlQueryParams,
} from "../../shared/routing/route-page-info";
import { BlockCollection } from "../shared/block-collection/block-collection";
import { CommentThread } from "../shared/block-collection/comments/comment-thread";
import { PageContextProvider } from "../shared/block-collection/page-context";
import { PageTitle } from "../shared/block-collection/page-title/page-title";
import {
  blockCollectionContentsStaticVariables,
  getBlockCollectionContents,
} from "../shared/block-collection-contents";
import { BlockCollectionContextProvider } from "../shared/block-collection-context";
import { iconVariantSizes } from "../../shared/edit-emoji-icon-button";
import {
  TOP_CONTEXT_BAR_HEIGHT,
  TopContextBar,
} from "../shared/top-context-bar";
import { CanvasPageBlock } from "./[page-slug].page/canvas-page";
import { ArchiveMenuItem } from "./shared/archive-menu-item";

export const pageContentWidth = 696;
export const commentsWidth = 320;
export const pageMinPadding = 48;

export const getPageSectionContainerStyles = (params: {
  pageComments?: PageThread[];
  readonly?: boolean;
}) => {
  const { pageComments, readonly } = params;

  const commentsContainerWidth =
    !readonly && pageComments?.length ? commentsWidth + pageMinPadding : 0;

  const paddingLeft = `max(calc((100% - ${
    pageContentWidth + commentsContainerWidth
  }px) / 2), ${pageMinPadding}px)`;
  const paddingRight = `calc(100% - ${pageContentWidth}px - ${paddingLeft})`;

  return {
    paddingLeft,
    paddingRight,
    minWidth: `calc(${pageContentWidth}px + (${pageMinPadding}px * 2))`,
  };
};

export interface PageSectionContainerProps {
  pageComments?: PageThread[];
  sx?: SxProps;
  readonly: boolean;
}

export const PageSectionContainer = ({
  children,
  pageComments,
  sx = [],
  readonly,
}: PropsWithChildren<PageSectionContainerProps>) => {
  return (
    <Box
      sx={[
        ...(pageComments
          ? [
              getPageSectionContainerStyles({
                pageComments,
                readonly,
              }),
            ]
          : []),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
};

type PageProps = {
  pageWorkspace: MinimalUser | MinimalOrg;
  pageEntityId: EntityId;
  blocks: HashBlock[];
};

/**
 * This is used to fetch the metadata associated with blocks that're preloaded
 * ahead of time so that the client doesn't need to
 *
 * @todo Include blocks present in the document in this, and remove fetching of these in canvas-page
 */
export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  req,
  params,
}) => {
  // Fetching block metadata can significantly slow down the server render, so disabling for now
  // const fetchedBlocks = await Promise.all(
  //   defaultBlockComponentIds.map((componentId) => fetchBlock(componentId)),
  // );

  if (!params || !isPageParsedUrlQuery(params)) {
    throw new Error(
      "Invalid page URL query params passed to `getServerSideProps`.",
    );
  }

  const { workspaceShortname, pageEntityUuid } =
    parsePageUrlQueryParams(params);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  const { cookie } = req.headers ?? {};

  const workspaceSubgraph = await apolloClient
    .query<StructuralQueryEntitiesQuery, StructuralQueryEntitiesQueryVariables>(
      {
        context: { headers: { cookie } },
        query: structuralQueryEntitiesQuery,
        variables: {
          includePermissions: false,
          query: {
            filter: {
              all: [
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        extractBaseUrl(
                          systemPropertyTypes.shortname.propertyTypeId,
                        ),
                      ],
                    },
                    { parameter: workspaceShortname },
                  ],
                },
                {
                  any: [
                    generateVersionedUrlMatchingFilter(
                      systemEntityTypes.user.entityTypeId,
                      { ignoreParents: true },
                    ),
                    generateVersionedUrlMatchingFilter(
                      systemEntityTypes.organization.entityTypeId,
                      { ignoreParents: true },
                    ),
                  ],
                },
              ],
            },
            graphResolveDepths: zeroedGraphResolveDepths,
            temporalAxes: currentTimeInstantTemporalAxes,
          },
        },
      },
    )
    .then(({ data }) =>
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.structuralQueryEntities.subgraph,
      ),
    );

  const pageWorkspaceEntity = getRoots(workspaceSubgraph)[0];

  if (!pageWorkspaceEntity) {
    throw new Error(
      `Could not find page workspace with shortname "${workspaceShortname}".`,
    );
  }

  const pageWorkspace = isEntityUserEntity(pageWorkspaceEntity)
    ? constructMinimalUser({
        userEntity: pageWorkspaceEntity,
      })
    : isEntityOrgEntity(pageWorkspaceEntity)
    ? constructMinimalOrg({
        orgEntity: pageWorkspaceEntity,
      })
    : undefined;

  if (!pageWorkspace) {
    throw new Error(
      `Entity with type ${pageWorkspaceEntity.metadata.entityTypeId} is not a user or an org entity`,
    );
  }

  const pageOwnedById = extractOwnedById(pageWorkspace);

  const pageEntityId = entityIdFromOwnedByIdAndEntityUuid(
    pageOwnedById,
    pageEntityUuid,
  );

  return {
    props: {
      pageWorkspace,
      blocks: [],
      pageEntityId,
    },
  };
};

const generateCrumbsFromPages = ({
  pages = [],
  pageEntityId,
  ownerShortname,
}: {
  pageEntityId: EntityId;
  pages: AccountPagesInfo["data"];
  ownerShortname: string;
}) => {
  const pageMap = new Map(
    pages.map((page) => [page.metadata.recordId.entityId, page]),
  );

  let currentPage = pageMap.get(pageEntityId);
  let arr = [];

  while (currentPage) {
    const currentPageEntityId = currentPage.metadata.recordId.entityId;

    const pageEntityUuid = extractEntityUuidFromEntityId(currentPageEntityId);
    arr.push({
      title: currentPage.title,
      href: constructPageRelativeUrl({
        workspaceShortname: ownerShortname,
        pageEntityUuid,
      }),
      id: currentPageEntityId,
      icon: (
        <PageIcon
          icon={currentPage.icon}
          size="small"
          isCanvas={
            currentPage.metadata.entityTypeId ===
            systemEntityTypes.canvas.entityTypeId
          }
        />
      ),
    });

    if (currentPage.parentPage) {
      currentPage = pageMap.get(
        currentPage.parentPage.metadata.recordId.entityId,
      );
    } else {
      break;
    }
  }

  arr = arr.reverse();

  return arr;
};

const Page: NextPageWithLayout<PageProps> = ({
  blocks,
  pageEntityId,
  pageWorkspace,
}) => {
  const pageOwnedById = extractOwnedByIdFromEntityId(pageEntityId);

  const { asPath } = useRouter();

  const routeHash = asPath.split("#")[1] ?? "";

  const { data: accountPages } = useAccountPages(pageOwnedById, true);

  const blocksMap = useMemo(() => {
    return keyBy(blocks, (block) => block.meta.componentId);
  }, [blocks]);

  const [pageState, setPageState] = useState<"normal" | "transferring">(
    "normal",
  );

  const { data, error, loading } = useQuery<
    GetEntityQuery,
    GetEntityQueryVariables
  >(getEntityQuery, {
    variables: {
      entityId: pageEntityId,
      ...blockCollectionContentsStaticVariables,
    },
  });

  const pageHeaderRef = useRef<HTMLElement>();

  // Collab position tracking is disabled.
  // const collabPositions = useCollabPositions(accountId, pageEntityId);
  // const reportPosition = useCollabPositionReporter(accountId, pageEntityId);
  // useCollabPositionTracking(reportPosition);

  useEffect(() => {
    const handleRouteChange = () => {
      if (pageState !== "normal") {
        setPageState("normal");
      }
    };

    Router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      Router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [pageState]);

  const scrollToTop = () => {
    if (!pageHeaderRef.current) {
      return;
    }
    pageHeaderRef.current.scrollIntoView({ behavior: "smooth" });
  };

  const { data: pageComments } = usePageComments(pageEntityId);

  const pageSectionContainerProps: PageSectionContainerProps = {
    pageComments,
    readonly: true,
  };

  const { subgraph, userPermissionsOnEntities } = data?.getEntity ?? {};

  const pageSubgraph = subgraph
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(subgraph)
    : undefined;

  const page = pageSubgraph ? getRoots(pageSubgraph)[0] : undefined;

  const contents = useMemo(
    () =>
      pageSubgraph
        ? getBlockCollectionContents({
            blockCollectionEntityId: pageEntityId,
            blockCollectionSubgraph: pageSubgraph,
          })
        : undefined,
    [pageEntityId, pageSubgraph],
  );

  if (pageState === "transferring") {
    return (
      <PageSectionContainer {...pageSectionContainerProps}>
        <h1>Transferring you to the new page...</h1>
      </PageSectionContainer>
    );
  }

  if (loading) {
    return (
      <PageSectionContainer {...pageSectionContainerProps}>
        <PageLoadingState />
      </PageSectionContainer>
    );
  }

  if (error) {
    return (
      <PageSectionContainer {...pageSectionContainerProps}>
        <h1>Error: {error.message}</h1>
      </PageSectionContainer>
    );
  }

  if (!page || !pageSubgraph || !userPermissionsOnEntities || !contents) {
    return (
      <PageSectionContainer {...pageSectionContainerProps}>
        <h1>No page data loaded.</h1>
      </PageSectionContainer>
    );
  }

  const { archived, icon, title } = simplifyProperties(
    page.properties as PageProperties,
  );

  const canUserEdit = userPermissionsOnEntities[pageEntityId]?.edit ?? false;

  const isSafari = isSafariBrowser();
  const pageTitle = isSafari && icon ? `${icon} ${title}` : title;

  const isCanvasPage =
    page.metadata.entityTypeId === systemEntityTypes.canvas.entityTypeId;

  return (
    <>
      <NextSeo
        key={pageEntityId}
        title={pageTitle || "Untitled"}
        additionalLinkTags={
          icon
            ? [
                {
                  rel: "icon",
                  href: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>
          ${icon}</text></svg>`,
                },
              ]
            : []
        }
      />

      <PageContextProvider pageEntityId={pageEntityId}>
        <Box
          sx={({ palette, zIndex }) => ({
            position: "sticky",
            top: 0,
            zIndex: zIndex.appBar,
            backgroundColor: palette.white,
          })}
        >
          <TopContextBar
            actionMenuItems={
              archived
                ? undefined
                : [
                    <ArchiveMenuItem
                      key={page.metadata.recordId.entityId}
                      item={page}
                    />,
                  ]
            }
            item={page}
            crumbs={generateCrumbsFromPages({
              pages: accountPages,
              pageEntityId: page.metadata.recordId.entityId,
              ownerShortname: pageWorkspace.shortname!,
            })}
            scrollToTop={scrollToTop}
          />
        </Box>

        {!isCanvasPage && (
          <PageSectionContainer
            {...pageSectionContainerProps}
            readonly={!canUserEdit}
          >
            <Box position="relative">
              <PageIconButton
                entityId={pageEntityId}
                pageEntityTypeId={page.metadata.entityTypeId}
                icon={icon}
                readonly={!canUserEdit}
                sx={({ breakpoints }) => ({
                  mb: 2,
                  [breakpoints.up(pageComments.length ? "xl" : "lg")]: {
                    position: "absolute",
                    top: 0,
                    right: "calc(100% + 24px)",
                  },
                })}
              />
              <Box
                component="header"
                ref={pageHeaderRef}
                sx={{
                  scrollMarginTop:
                    HEADER_HEIGHT +
                    TOP_CONTEXT_BAR_HEIGHT +
                    iconVariantSizes.medium.container,
                }}
              >
                <PageTitle
                  value={title}
                  pageEntityId={pageEntityId}
                  readonly={!canUserEdit}
                />
                {/*
            Commented out Version Dropdown and Transfer Page buttons.
            They will most likely be added back when new designs
            for them have been added
          */}
                {/* <div style={{"marginRight":"1rem"}}>
            <label>Version</label>
            <div>
              <VersionDropdown
                value={data.page.entityVersionId}
                versions={data.page.history ?? []}
                onChange={(changedVersionId) => {
                  void router.push(
                    `/@${ownerShortname}/${pageEntityId}?version=${changedVersionId}`,
                  );
                }}
              />
            </div>
          </div>
          <div>
            <label>Transfer Page</label>
            <div>
              <PageTransferDropdown
                accountId={accountId}
                pageEntityId={pageEntityId}
                setPageState={setPageState}
              />
            </div>
          </div> */}
              </Box>
            </Box>
          </PageSectionContainer>
        )}

        <CollabPositionProvider value={[]}>
          <UserBlocksProvider value={blocksMap}>
            <BlockLoadedProvider routeHash={routeHash}>
              <BlockCollectionContextProvider
                blockCollectionSubgraph={pageSubgraph}
                userPermissionsOnEntities={userPermissionsOnEntities}
              >
                {isCanvasPage ? (
                  <CanvasPageBlock contents={contents} />
                ) : (
                  <Box marginTop={5} position="relative">
                    {!!canUserEdit && pageComments.length > 0 ? (
                      <PageSectionContainer
                        pageComments={pageComments}
                        readonly={!canUserEdit}
                        sx={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          left: 0,
                          width: "100%",
                        }}
                      >
                        <Box width="100%" position="relative">
                          <Box
                            sx={{
                              position: "absolute",
                              left: "calc(100% + 48px)",
                              zIndex: 1,
                            }}
                          >
                            {pageComments.map((comment) => (
                              <CommentThread
                                key={comment.metadata.recordId.entityId}
                                pageId={pageEntityId}
                                comment={comment}
                              />
                            ))}
                          </Box>
                        </Box>
                      </PageSectionContainer>
                    ) : null}

                    <BlockCollection
                      ownedById={extractOwnedById(pageWorkspace)}
                      contents={contents}
                      enableCommenting
                      entityId={pageEntityId}
                      readonly={!canUserEdit}
                      autoFocus={title !== ""}
                      sx={{
                        /**
                         * to handle margin-clicking, prosemirror should take full width, and give padding to it's content
                         * so it automatically handles focusing on closest node on margin-clicking
                         */
                        ".ProseMirror": {
                          ...getPageSectionContainerStyles({
                            pageComments,
                            readonly: !canUserEdit,
                          }),
                        },
                      }}
                    />
                  </Box>
                )}
              </BlockCollectionContextProvider>
            </BlockLoadedProvider>
          </UserBlocksProvider>
        </CollabPositionProvider>
      </PageContextProvider>
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
    grayBackground: false,
  });

export default Page;
