import { useQuery } from "@apollo/client";
import { BlockMeta, fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";
import { defaultBlocks } from "@hashintel/hash-shared/defaultBlocks";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";
import { Box, Collapse, alpha } from "@mui/material";
import { keyBy } from "lodash";
import { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import { Router, useRouter } from "next/router";

import React, {
  useEffect,
  useMemo,
  useState,
  VoidFunctionComponent,
} from "react";
import { useCollabPositionReporter } from "../../blocks/page/collab/useCollabPositionReporter";
import { useCollabPositions } from "../../blocks/page/collab/useCollabPositions";
import { useCollabPositionTracking } from "../../blocks/page/collab/useCollabPositionTracking";
import { PageBlock } from "../../blocks/page/PageBlock";
import { PageTitle } from "../../blocks/page/PageTitle";
import { useArchivePage } from "../../components/hooks/useArchivePage";
import { CollabPositionProvider } from "../../contexts/CollabPositionContext";
import {
  GetPageInfoQuery,
  GetPageInfoQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { useRouteAccountInfo, useRoutePageInfo } from "../../shared/routing";
import { Button } from "../../shared/ui/button";

// Apparently defining this is necessary in order to get server rendered props?
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () => ({
  paths: [], // indicates that no page needs be created at build time
  fallback: "blocking", // indicates the type of fallback
});

type PageProps = {
  blocksMeta: BlockMeta[];
};

/**
 * This is used to fetch the metadata associated with blocks that're preloaded
 * ahead of time so that the client doesn't need to
 *
 * @todo Include blocks present in the document in this
 */
export const getStaticProps: GetStaticProps<PageProps> = async () => {
  const fetchedBlocksMeta = await Promise.all(
    defaultBlocks.map((componentId) => fetchBlockMeta(componentId)),
  );

  return {
    props: {
      blocksMeta: fetchedBlocksMeta,
    },
  };
};

export const PageNotificationBanner: VoidFunctionComponent = () => {
  const router = useRouter();

  const { accountId } = useRouteAccountInfo();
  const { pageEntityId } = useRoutePageInfo();
  const versionId = router.query.version as string | undefined;

  const { unarchivePage } = useArchivePage();

  const { data } = useQuery<GetPageInfoQuery, GetPageInfoQueryVariables>(
    getPageInfoQuery,
    {
      variables: { entityId: pageEntityId, accountId, versionId },
    },
  );

  const archived = data?.page?.properties?.archived;

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
            accountId && pageEntityId && unarchivePage(accountId, pageEntityId)
          }
        >
          Restore
        </Button>
      </Box>
    </Collapse>
  );
};

const Page: NextPageWithLayout<PageProps> = ({ blocksMeta }) => {
  const router = useRouter();

  const { accountId } = useRouteAccountInfo();
  // pageEntityId is the consistent identifier for pages (across all versions)
  const { pageEntityId } = useRoutePageInfo();
  // versionId is an optional param for requesting a specific page version
  const versionId = router.query.version as string | undefined;

  const blocksMetaMap = useMemo(() => {
    return keyBy(
      blocksMeta,
      (blockMeta) => blockMeta.componentMetadata.componentId,
    );
  }, [blocksMeta]);

  const [pageState, setPageState] = useState<"normal" | "transferring">(
    "normal",
  );

  const { data, error, loading } = useQuery<
    GetPageInfoQuery,
    GetPageInfoQueryVariables
  >(getPageInfoQuery, {
    variables: { entityId: pageEntityId, accountId, versionId },
  });

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

  if (pageState === "transferring") {
    return <h1>Transferring you to the new page...</h1>;
  }

  if (loading) {
    return <h1>Loading...</h1>;
  }

  if (error) {
    return <h1>Error: {error.message}</h1>;
  }

  if (!data) {
    return <h1>No data loaded.</h1>;
  }

  const { title } = data.page.properties;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <header>
        <Box display="flex">
          <PageTitle
            value={title}
            accountId={accountId}
            metadataId={pageEntityId}
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
      </header>

      <main>
        <CollabPositionProvider value={collabPositions}>
          <PageBlock
            accountId={accountId}
            blocksMeta={blocksMetaMap}
            entityId={pageEntityId}
          />
        </CollabPositionProvider>
      </main>
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, { banner: <PageNotificationBanner /> });

export default Page;
