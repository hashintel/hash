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
import { PageTransferDropdown } from "../../components/Dropdowns/PageTransferDropdown";
import { MainContentWrapper } from "../../components/layout/MainContentWrapper";
import { RemoteBlockMetadata } from "../../blocks/userBlocks";
import { useCurrentWorkspaceContext } from "../../contexts/CurrentWorkspaceContext";

// Apparently defining this is necessary in order to get server rendered props?
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () => ({
  paths: [], // indicates that no page needs be created at build time
  fallback: "blocking", // indicates the type of fallback
});

interface PageProps {
  blocksMeta: BlockMeta[];
}

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

export const Page: React.VFC<PageProps> = ({ blocksMeta }) => {
  const router = useRouter();

  // entityId is the consistent identifier for pages (across all versions)
  const pageEntityId = router.query.pageEntityId as string;
  const accountId = useCurrentWorkspaceContext().accountId!;
  // versionId is an optional param for requesting a specific page version
  const versionId = router.query.version as string | undefined;

  const blocksMetaMap = useMemo(() => {
    return keyBy(
      blocksMeta,
      (blockMeta) => blockMeta.componentMetadata.componentId,
    );
  }, [blocksMeta]);

  const initialUserBlocks: RemoteBlockMetadata[] = useMemo(() => {
    return blocksMeta.map((blockMeta) => blockMeta.componentMetadata);
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
    return (
      <MainContentWrapper>
        <h1>Transferring you to the new page...</h1>
      </MainContentWrapper>
    );
  }

  if (loading) {
    return (
      <MainContentWrapper>
        <h1>Loading...</h1>
      </MainContentWrapper>
    );
  }

  if (error) {
    return (
      <MainContentWrapper>
        <h1>Error: {error.message}</h1>
      </MainContentWrapper>
    );
  }

  if (!data) {
    return (
      <MainContentWrapper>
        <h1>No data loaded.</h1>
      </MainContentWrapper>
    );
  }

  const { title } = data.page.properties;

  return (
    <MainContentWrapper>
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
            initialUserBlocks={initialUserBlocks}
            entityId={data.page.entityId}
          />
        </CollabPositionProvider>
      </main>
    </MainContentWrapper>
  );
};
export default Page;
