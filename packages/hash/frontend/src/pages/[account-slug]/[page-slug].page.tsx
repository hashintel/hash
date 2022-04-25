import { useQuery } from "@apollo/client";
import { BlockMeta, fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { keyBy } from "lodash";
import { GetStaticPaths, GetStaticProps } from "next";
import { Router, useRouter } from "next/router";
import { tw } from "twind";

import React, { useEffect, useMemo, useState } from "react";
import { defaultBlocks } from "@hashintel/hash-shared/defaultBlocks";
import {
  GetPageQuery,
  GetPageQueryVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { useCollabPositions } from "../../blocks/page/collab/useCollabPositions";
import { useCollabPositionTracking } from "../../blocks/page/collab/useCollabPositionTracking";
import { useCollabPositionReporter } from "../../blocks/page/collab/useCollabPositionReporter";
import { PageBlock } from "../../blocks/page/PageBlock";
import { PageTitle } from "../../blocks/page/PageTitle";
import { VersionDropdown } from "../../components/Dropdowns/VersionDropdown";

import styles from "../index.module.scss";
import { CollabPositionProvider } from "../../contexts/CollabPositionContext";
import { PageTransferDropdown } from "./[page-slug].page/page-transfer-dropdown";
import { NextPageWithLayout, getLayoutWithSidebar } from "../../shared/layout";
import { useRouteAccountInfo, useRoutePageInfo } from "../../shared/routing";

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
    GetPageQuery,
    GetPageQueryVariables
  >(getPageQuery, {
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
      <header>
        <div className={styles.PageHeader}>
          <div className={tw`flex flex-col-reverse`}>
            <PageTitle
              value={title}
              accountId={data.page.accountId}
              metadataId={data.page.entityId}
            />
          </div>
          <div className={tw`mr-4`}>
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
          </div>
        </div>
      </header>

      <main>
        <CollabPositionProvider value={collabPositions}>
          <PageBlock
            accountId={data.page.accountId}
            blocksMeta={blocksMetaMap}
            entityId={data.page.entityId}
          />
        </CollabPositionProvider>
      </main>
    </>
  );
};

Page.getLayout = getLayoutWithSidebar;

export default Page;
