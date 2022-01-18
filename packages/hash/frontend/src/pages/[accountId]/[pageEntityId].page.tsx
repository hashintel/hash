import { useQuery } from "@apollo/client";
import { BlockMeta, fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";
import { blockPaths } from "@hashintel/hash-shared/paths";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { GetStaticPaths, GetStaticProps } from "next";
import { Router, useRouter } from "next/router";
import { tw } from "twind";

import { useEffect, useMemo, useState, VoidFunctionComponent } from "react";
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

/**
 * preload all configured blocks for now. in the future these will be loaded
 * progressively from the block catalogue.
 */
const preloadedComponentIds = Object.keys(blockPaths);

// Apparently defining this is necessary in order to get server rendered props?
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () => ({
  paths: [], // indicates that no page needs be created at build time
  fallback: "blocking", // indicates the type of fallback
});

/**
 * This is used to fetch the metadata associated with blocks that're preloaded
 * ahead of time so that the client doesn't need to
 *
 * @todo Include blocks present in the document in this
 */
export const getStaticProps: GetStaticProps = async () => {
  const preloadedBlockMeta = await Promise.all(
    preloadedComponentIds?.map((componentId) => fetchBlockMeta(componentId)) ??
      [],
  );

  return { props: { preloadedBlockMeta } };
};

export const Page: VoidFunctionComponent<{
  preloadedBlockMeta: BlockMeta[];
}> = ({ preloadedBlockMeta }) => {
  const router = useRouter();

  // entityId is the consistent identifier for pages (across all versions)
  const pageEntityId = router.query.pageEntityId as string;
  const accountId = router.query.accountId as string;
  // versionId is an optional param for requesting a specific page version
  const versionId = router.query.version as string | undefined;

  const [pageState, setPageState] = useState<"normal" | "transferring">(
    "normal",
  );

  const { data, error, loading } = useQuery<
    GetPageQuery,
    GetPageQueryVariables
  >(getPageQuery, {
    variables: { entityId: pageEntityId, accountId, versionId },
  });

  /**
   * This is to ensure that certain blocks are always contained within the
   * "select type" dropdown even if the document does not yet contain those
   * blocks. This is important for paragraphs especially, as the first text
   * block in the schema is what prosemirror defaults to when creating a new
   * paragraph. We need to change it so the order of blocks in the dropdown
   * is not determinned by the order in the prosemirror schema, and also so
   * that items can be in that dropdown without having be loaded into the
   * schema.
   *
   * @todo this doesn't need to be a map.
   */
  const preloadedBlocks = useMemo(
    () =>
      new Map(
        preloadedBlockMeta
          /**
           * Paragraph must be first for now, as it'll bw the first loaded
           * into prosemirror and therefore the block chosen when you
           * press enter.
           *
           * @todo remove need for this
           */
          .sort((a, b) =>
            a.componentMetadata.name === "paragraph"
              ? -1
              : b.componentMetadata.name === "paragraph"
              ? 1
              : 0,
          )
          .map((node) => [node.componentMetadata.componentId, node] as const),
      ),
    [preloadedBlockMeta],
  );

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
            blocksMeta={preloadedBlocks}
            entityId={data.page.entityId}
          />
        </CollabPositionProvider>
      </main>
    </MainContentWrapper>
  );
};
export default Page;
