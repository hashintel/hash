import { useQuery } from "@apollo/client";
import {
  HashBlock,
  defaultBlockComponentIds,
  fetchBlock,
} from "@hashintel/hash-shared/blocks";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";
import { isSafariBrowser } from "@hashintel/hash-shared/util";
import { Box, Collapse, alpha, styled } from "@mui/material";
import { keyBy } from "lodash";
import { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import { Router, useRouter } from "next/router";

import { useEffect, useMemo, useState, FunctionComponent, useRef } from "react";
import { useCollabPositionReporter } from "../../blocks/page/collab/useCollabPositionReporter";
import { useCollabPositions } from "../../blocks/page/collab/useCollabPositions";
import { useCollabPositionTracking } from "../../blocks/page/collab/useCollabPositionTracking";
import {
  PageBlock,
  PAGE_HORIZONTAL_PADDING_FORMULA,
  PAGE_MIN_PADDING,
} from "../../blocks/page/PageBlock";
import { PageContextProvider } from "../../blocks/page/PageContext";
import { PageTitle } from "../../blocks/page/PageTitle/PageTitle";
import {
  AccountPagesInfo,
  useAccountPages,
} from "../../components/hooks/useAccountPages";
import { useArchivePage } from "../../components/hooks/useArchivePage";
import { PageIcon, pageIconVariantSizes } from "../../components/PageIcon";
import { PageIconButton } from "../../components/PageIconButton";
import { PageLoadingState } from "../../components/PageLoadingState";
import { CollabPositionProvider } from "../../contexts/CollabPositionContext";
import {
  GetPageInfoQuery,
  GetPageInfoQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { useReadonlyMode } from "../../shared/readonly-mode";
import { useRouteAccountInfo, useRoutePageInfo } from "../../shared/routing";
import { Button } from "../../shared/ui/button";
import {
  TopContextBar,
  TOP_CONTEXT_BAR_HEIGHT,
} from "../shared/top-context-bar";

// Apparently defining this is necessary in order to get server rendered props?
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () => ({
  paths: [], // indicates that no page needs be created at build time
  fallback: "blocking", // indicates the type of fallback
});

type PageProps = {
  blocks: HashBlock[];
};

/**
 * This is used to fetch the metadata associated with blocks that're preloaded
 * ahead of time so that the client doesn't need to
 *
 * @todo Include blocks present in the document in this
 */
export const getStaticProps: GetStaticProps<PageProps> = async () => {
  const fetchedBlocks = await Promise.all(
    defaultBlockComponentIds.map((componentId) => fetchBlock(componentId)),
  );

  return {
    props: {
      blocks: fetchedBlocks,
    },
  };
};

export const PageNotificationBanner: FunctionComponent = () => {
  const router = useRouter();

  const { accountId } = useRouteAccountInfo();
  const { pageEntityId } = useRoutePageInfo();
  const versionId = router.query.version as string | undefined;

  const [archivePage] = useArchivePage();

  const { data } = useQuery<GetPageInfoQuery, GetPageInfoQueryVariables>(
    getPageInfoQuery,
    {
      variables: {
        ownedById: accountId,
        entityId: pageEntityId,
        entityVersion: versionId,
      },
    },
  );

  const archived = data?.persistedPage?.archived;

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
          onClick={() =>
            accountId &&
            pageEntityId &&
            archivePage(false, accountId, pageEntityId)
          }
        >
          Restore
        </Button>
      </Box>
    </Collapse>
  );
};

const generateCrumbsFromPages = ({
  pages = [],
  pageId,
  accountId,
}: {
  pageId: string;
  accountId: string;
  pages: AccountPagesInfo["data"];
}) => {
  const pageMap = new Map(pages.map((page) => [page.entityId, page]));

  let currentPage = pageMap.get(pageId);
  let arr = [];

  while (currentPage) {
    arr.push({
      title: currentPage.title,
      href: `/${accountId}/${currentPage.entityId}`,
      id: currentPage.entityId,
      icon: (
        <PageIcon
          ownedById={accountId}
          entityId={currentPage.entityId}
          size="small"
        />
      ),
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

const Container = styled("div")({
  padding: `${PAGE_MIN_PADDING}px ${PAGE_HORIZONTAL_PADDING_FORMULA} 0`,
});

const Page: NextPageWithLayout<PageProps> = ({ blocks }) => {
  const router = useRouter();

  const { accountId } = useRouteAccountInfo();
  // pageEntityId is the consistent identifier for pages (across all versions)
  const { pageEntityId } = useRoutePageInfo();
  // versionId is an optional param for requesting a specific page version
  const versionId = router.query.version as string | undefined;

  const { data: accountPages } = useAccountPages(accountId);

  const blocksMap = useMemo(() => {
    return keyBy(blocks, (block) => block.meta.componentId);
  }, [blocks]);

  const [pageState, setPageState] = useState<"normal" | "transferring">(
    "normal",
  );

  const { data, error, loading } = useQuery<
    GetPageInfoQuery,
    GetPageInfoQueryVariables
  >(getPageInfoQuery, {
    variables: {
      ownedById: accountId,
      entityId: pageEntityId,
      entityVersion: versionId,
    },
  });
  const pageHeaderRef = useRef<HTMLElement>();
  const { readonlyMode } = useReadonlyMode();
  const collabPositions = useCollabPositions(accountId, pageEntityId);
  const reportPosition = useCollabPositionReporter(accountId, pageEntityId);
  useCollabPositionTracking(reportPosition);

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

  if (pageState === "transferring") {
    return (
      <Container>
        <h1>Transferring you to the new page...</h1>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <PageLoadingState />
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <h1>Error: {error.message}</h1>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container>
        <h1>No data loaded.</h1>
      </Container>
    );
  }

  const { title, icon } = data.persistedPage;

  const isSafari = isSafariBrowser();
  const pageTitle = isSafari && icon ? `${icon} ${title}` : title;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>

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

      <PageContextProvider>
        <Box
          sx={({ zIndex, palette }) => ({
            position: "sticky",
            top: 0,
            zIndex: zIndex.appBar,
            backgroundColor: palette.white,
          })}
        >
          <TopContextBar
            crumbs={generateCrumbsFromPages({
              pages: accountPages,
              pageId: data.persistedPage.entityId,
              accountId,
            })}
            scrollToTop={scrollToTop}
          />
          <PageNotificationBanner />
        </Box>

        <Container>
          <Box position="relative">
            <PageIconButton
              ownedById={accountId}
              entityId={pageEntityId}
              versionId={versionId}
              readonly={readonlyMode}
              sx={({ breakpoints }) => ({
                mb: 2,
                [breakpoints.up("lg")]: {
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
                ownedById={accountId}
                pageEntityId={pageEntityId}
              />
              {/*
            Commented out Version Dropdown and Transfer Page buttons.
            They will most likely be added back when new designs 
            for them have been added
          */}
              {/* <div className={tw`mr-4`}>
            <label>Version</label>
            <div>
              <VersionDropdown
                value={data.page.entityVersionId}
                versions={data.page.history ?? []}
                onChange={(changedVersionId) => {
                  void router.push(
                    `/${accountId}/${pageEntityId}?version=${changedVersionId}`,
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
        </Container>

        <CollabPositionProvider value={collabPositions}>
          <PageBlock
            accountId={accountId}
            blocks={blocksMap}
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
