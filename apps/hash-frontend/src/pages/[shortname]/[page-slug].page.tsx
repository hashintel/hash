import { useQuery } from "@apollo/client";
import {
  GetPageQuery,
  GetPageQueryVariables,
} from "@local/hash-graphql-shared/graphql/api-types.gen";
import {
  getPageInfoQuery,
  getPageQuery,
} from "@local/hash-graphql-shared/queries/page.queries";
import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
} from "@local/hash-graphql-shared/types";
import {
  defaultBlockComponentIds,
  fetchBlock,
  HashBlock,
} from "@local/hash-isomorphic-utils/blocks";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { isSafariBrowser } from "@local/hash-isomorphic-utils/util";
import { getRootsAsEntities } from "@local/hash-subgraph/src/stdlib/element/entity";
import { alpha, Box, Collapse } from "@mui/material";
import { keyBy } from "lodash";
import { GetServerSideProps } from "next";
import { NextParsedUrlQuery } from "next/dist/server/request-meta";
import Head from "next/head";
import { Router } from "next/router";
import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";

// import { useCollabPositionReporter } from "../../blocks/page/collab/use-collab-position-reporter";
// import { useCollabPositions } from "../../blocks/page/collab/use-collab-positions";
// import { useCollabPositionTracking } from "../../blocks/page/collab/use-collab-position-tracking";
import { PageBlock } from "../../blocks/page/page-block";
import {
  PageContextProvider,
  usePageContext,
} from "../../blocks/page/page-context";
import {
  PageSectionContainer,
  PageSectionContainerProps,
} from "../../blocks/page/page-section-container";
import { PageTitle } from "../../blocks/page/page-title/page-title";
import {
  AccountPagesInfo,
  useAccountPages,
} from "../../components/hooks/use-account-pages";
import { useArchivePage } from "../../components/hooks/use-archive-page";
import { usePageComments } from "../../components/hooks/use-page-comments";
import { PageIcon, pageIconVariantSizes } from "../../components/page-icon";
import { PageIconButton } from "../../components/page-icon-button";
import { PageLoadingState } from "../../components/page-loading-state";
import { CollabPositionProvider } from "../../contexts/collab-position-context";
import {
  GetAllLatestEntitiesQuery,
  GetPageInfoQuery,
  GetPageInfoQueryVariables,
} from "../../graphql/api-types.gen";
import { getAllLatestEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../../lib/apollo-client";
import { constructPageRelativeUrl } from "../../lib/routes";
import {
  constructMinimalOrg,
  constructMinimalUser,
  MinimalOrg,
  MinimalUser,
} from "../../lib/user-and-org";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { useIsReadonlyModeForResource } from "../../shared/readonly-mode";
import { Button } from "../../shared/ui/button";
import {
  TOP_CONTEXT_BAR_HEIGHT,
  TopContextBar,
} from "../shared/top-context-bar";

type PageProps = {
  pageWorkspace: MinimalUser | MinimalOrg;
  pageEntityId: EntityId;
  blocks: HashBlock[];
};

type PageParsedUrlQuery = {
  shortname: string;
  "page-slug": string;
};

export const isPageParsedUrlQuery = (
  queryParams: NextParsedUrlQuery,
): queryParams is PageParsedUrlQuery =>
  typeof queryParams.shortname === "string" &&
  typeof queryParams["page-slug"] === "string";

export const parsePageUrlQueryParams = (params: PageParsedUrlQuery) => {
  const workspaceShortname = params.shortname.slice(1);

  const pageEntityUuid = params["page-slug"] as EntityUuid;

  return { workspaceShortname, pageEntityUuid };
};

/**
 * This is used to fetch the metadata associated with blocks that're preloaded
 * ahead of time so that the client doesn't need to
 *
 * @todo Include blocks present in the document in this
 */
export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  req,
  params,
}) => {
  const fetchedBlocks = await Promise.all(
    defaultBlockComponentIds.map((componentId) => fetchBlock(componentId)),
  );

  if (!params || !isPageParsedUrlQuery(params)) {
    throw new Error(
      "Invalid page URL query params passed to `getServerSideProps`.",
    );
  }

  const { workspaceShortname, pageEntityUuid } =
    parsePageUrlQueryParams(params);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  const { cookie } = req.headers ?? {};

  const workspacesSubgraph = await apolloClient
    .query<GetAllLatestEntitiesQuery>({
      query: getAllLatestEntitiesQuery,
      variables: {
        rootEntityTypeIds: [
          types.entityType.user.entityTypeId,
          types.entityType.org.entityTypeId,
        ],
        constrainsValuesOn: { outgoing: 0 },
        constrainsPropertiesOn: { outgoing: 0 },
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 1 },
        hasLeftEntity: { incoming: 1, outgoing: 1 },
        hasRightEntity: { incoming: 1, outgoing: 1 },
      },
      context: { headers: { cookie } },
    })
    .then(({ data }) => data.getAllLatestEntities);

  const workspaces = getRootsAsEntities(workspacesSubgraph).map((entity) =>
    entity.metadata.entityTypeId === types.entityType.user.entityTypeId
      ? constructMinimalUser({
          userEntity: entity,
        })
      : constructMinimalOrg({
          orgEntity: entity,
        }),
  );

  /**
   * @todo: filtering all workspaces by their shortname should not be happening
   * client side. This could be addressed by exposing structural querying
   * to the frontend.
   *
   * @see https://app.asana.com/0/1201095311341924/1202863271046362/f
   */
  const pageWorkspace = workspaces.find(
    (workspace) => workspace.shortname === workspaceShortname,
  );

  if (!pageWorkspace) {
    throw new Error(
      `Could not find page workspace with shortname "${workspaceShortname}".`,
    );
  }

  const pageOwnedById = pageWorkspace.accountId as OwnedById;

  const pageEntityId = entityIdFromOwnedByIdAndEntityUuid(
    pageOwnedById,
    pageEntityUuid,
  );

  return {
    props: {
      pageWorkspace,
      blocks: fetchedBlocks,
      pageEntityId,
    },
  };
};

export const PageNotificationBanner: FunctionComponent = () => {
  const { pageEntityId } = usePageContext();
  const [archivePage] = useArchivePage();

  const { data } = useQuery<GetPageInfoQuery, GetPageInfoQueryVariables>(
    getPageInfoQuery,
    {
      variables: {
        entityId: pageEntityId,
      },
    },
  );

  const archived = data?.page.archived;

  return (
    <Collapse in={!!archived}>
      <Box
        sx={({ palette }) => ({
          color: palette.common.white,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: 1,
          background: palette.red[60],
          padding: 1,
        })}
      >
        This page is archived.
        <Button
          variant="secondary"
          sx={({ palette }) => ({
            marginLeft: 1.5,
            minWidth: 0,
            minHeight: 0,
            paddingY: 0,
            paddingX: 1.5,
            background: "transparent",
            color: palette.common.white,
            borderColor: palette.common.white,
            fontWeight: 400,
            "&:hover": {
              background: alpha(palette.gray[90], 0.08),
            },
          })}
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
          onClick={() => pageEntityId && archivePage(false, pageEntityId)}
        >
          Restore
        </Button>
      </Box>
    </Collapse>
  );
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
  const pageMap = new Map(pages.map((page) => [page.entityId, page]));

  let currentPage = pageMap.get(pageEntityId);
  let arr = [];

  while (currentPage) {
    const pageEntityUuid = extractEntityUuidFromEntityId(currentPage.entityId);
    arr.push({
      title: currentPage.title,
      href: constructPageRelativeUrl({
        workspaceShortname: ownerShortname,
        pageEntityUuid,
      }),
      id: currentPage.entityId,
      icon: <PageIcon entityId={currentPage.entityId} size="small" />,
    });

    if (currentPage.parentPageEntityId) {
      currentPage = pageMap.get(currentPage.parentPageEntityId);
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

  const { data: accountPages } = useAccountPages(pageOwnedById);

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
      <Head>
        <title>{pageTitle} | Page | HASH</title>

        {/*
          Rendering favicon.png again even if it's already defined on _document.page.tsx,
          because client-side navigation does not fallback to the default icon when visiting a page without an icon
        */}
        {icon ? (
          <link
            rel="icon"
            href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>
          ${icon}</text></svg>`}
          />
        ) : (
          <link rel="icon" type="image/png" href="/favicon.png" />
        )}
      </Head>

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
            crumbs={generateCrumbsFromPages({
              pages: accountPages,
              pageEntityId: data.page.metadata.recordId.entityId as EntityId,
              ownerShortname: pageWorkspace.shortname!,
            })}
            scrollToTop={scrollToTop}
          />
          <PageNotificationBanner />
        </Box>

        <PageSectionContainer {...pageSectionContainerProps}>
          <Box position="relative">
            <PageIconButton
              entityId={pageEntityId}
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

        <CollabPositionProvider value={[]}>
          <PageBlock
            accountId={pageWorkspace.accountId}
            contents={contents}
            blocks={blocksMap}
            pageComments={pageComments}
            entityId={pageEntityId}
          />
        </CollabPositionProvider>
      </PageContextProvider>
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
