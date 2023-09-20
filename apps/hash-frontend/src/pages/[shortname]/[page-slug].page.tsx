import { useQuery } from "@apollo/client";
import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  GetPageQuery,
  GetPageQueryVariables,
} from "@local/hash-graphql-shared/graphql/api-types.gen";
import { getPageQuery } from "@local/hash-graphql-shared/queries/page.queries";
import { HashBlock } from "@local/hash-isomorphic-utils/blocks";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  OrgProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { isSafariBrowser } from "@local/hash-isomorphic-utils/util";
import {
  Entity,
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import { keyBy } from "lodash";
import { GetServerSideProps } from "next";
import { Router, useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo, useRef, useState } from "react";

import { BlockLoadedProvider } from "../../blocks/on-block-loaded";
import { PageBlock } from "../../blocks/page/page-block";
import { PageContextProvider } from "../../blocks/page/page-context";
import {
  PageSectionContainer,
  PageSectionContainerProps,
} from "../../blocks/page/page-section-container";
import { PageTitle } from "../../blocks/page/page-title/page-title";
import { UserBlocksProvider } from "../../blocks/user-blocks";
import {
  AccountPagesInfo,
  useAccountPages,
} from "../../components/hooks/use-account-pages";
import { usePageComments } from "../../components/hooks/use-page-comments";
import { PageIcon, pageIconVariantSizes } from "../../components/page-icon";
import { PageIconButton } from "../../components/page-icon-button";
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
  MinimalOrg,
  MinimalUser,
} from "../../lib/user-and-org";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { useIsReadonlyModeForResource } from "../../shared/readonly-mode";
import {
  isPageParsedUrlQuery,
  parsePageUrlQueryParams,
} from "../../shared/routing/route-page-info";
import {
  TOP_CONTEXT_BAR_HEIGHT,
  TopContextBar,
} from "../shared/top-context-bar";
import { CanvasPageBlock } from "./[page-slug].page/canvas-page";
import { ArchiveMenuItem } from "./shared/archive-menu-item";

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

  const workspaceSubgraph = (await apolloClient
    .query<StructuralQueryEntitiesQuery, StructuralQueryEntitiesQueryVariables>(
      {
        context: { headers: { cookie } },
        query: structuralQueryEntitiesQuery,
        variables: {
          query: {
            filter: {
              all: [
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        extractBaseUrl(
                          types.propertyType.shortname.propertyTypeId,
                        ),
                      ],
                    },
                    { parameter: workspaceShortname },
                  ],
                },
                {
                  any: [
                    {
                      equal: [
                        { path: ["type", "versionedUrl"] },
                        { parameter: types.entityType.user.entityTypeId },
                      ],
                    },
                    {
                      equal: [
                        { path: ["type", "versionedUrl"] },
                        { parameter: types.entityType.org.entityTypeId },
                      ],
                    },
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
    .then(
      ({ data }) => data.structuralQueryEntities,
    )) as Subgraph<EntityRootType>;

  const pageWorkspaceEntity = getRoots(workspaceSubgraph)[0];

  if (!pageWorkspaceEntity) {
    throw new Error(
      `Could not find page workspace with shortname "${workspaceShortname}".`,
    );
  }

  const pageWorkspace =
    pageWorkspaceEntity.metadata.entityTypeId ===
    types.entityType.user.entityTypeId
      ? constructMinimalUser({
          userEntity: pageWorkspaceEntity as Entity<UserProperties>,
        })
      : constructMinimalOrg({
          orgEntity: pageWorkspaceEntity as Entity<OrgProperties>,
        });

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
      icon: <PageIcon icon={currentPage.icon} size="small" />,
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

  const { asPath, query } = useRouter();
  const canvasPage = query.canvas;

  const routeHash = asPath.split("#")[1] ?? "";

  const { data: accountPages } = useAccountPages(pageOwnedById, true);

  const blocksMap = useMemo(() => {
    return keyBy(blocks, (block) => block.meta.componentId);
  }, [blocks]);

  const [pageState, setPageState] = useState<"normal" | "transferring">(
    "normal",
  );

  const { data, error, loading } = useQuery<
    GetPageQuery,
    GetPageQueryVariables
  >(getPageQuery, { variables: { entityId: pageEntityId } });

  const pageHeaderRef = useRef<HTMLElement>();
  const isReadonlyMode = useIsReadonlyModeForResource(pageOwnedById);

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
    readonly: isReadonlyMode,
  };

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

  if (!data) {
    return (
      <PageSectionContainer {...pageSectionContainerProps}>
        <h1>No data loaded.</h1>
      </PageSectionContainer>
    );
  }

  const { title, icon, contents } = data.page;

  const isSafari = isSafariBrowser();
  const pageTitle = isSafari && icon ? `${icon} ${title}` : title;

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
              data.page.archived
                ? undefined
                : [
                    <ArchiveMenuItem
                      key={data.page.metadata.recordId.entityId}
                      item={data.page}
                    />,
                  ]
            }
            item={data.page}
            crumbs={generateCrumbsFromPages({
              pages: accountPages,
              pageEntityId: data.page.metadata.recordId.entityId,
              ownerShortname: pageWorkspace.shortname!,
            })}
            scrollToTop={scrollToTop}
          />
        </Box>

        {!canvasPage && (
          <PageSectionContainer {...pageSectionContainerProps}>
            <Box position="relative">
              <PageIconButton
                entityId={pageEntityId}
                icon={icon}
                readonly={isReadonlyMode}
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
                    pageIconVariantSizes.medium.container,
                }}
              >
                <PageTitle
                  value={title}
                  pageEntityId={pageEntityId}
                  readonly={isReadonlyMode}
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
              {canvasPage ? (
                <CanvasPageBlock contents={contents} />
              ) : (
                <PageBlock
                  ownedById={extractOwnedById(pageWorkspace)}
                  contents={contents}
                  pageComments={pageComments}
                  entityId={pageEntityId}
                />
              )}
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
