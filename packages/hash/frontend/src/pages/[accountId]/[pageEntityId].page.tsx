import { useQuery } from "@apollo/client";
import { BlockMeta, fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";
import { blockPaths } from "@hashintel/hash-shared/paths";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import { tw } from "twind";

import { useEffect, useMemo, useState, VoidFunctionComponent } from "react";
import { useCollabPositions } from "../../blocks/page/collab/useCollabPositions";
import { useCollabPositionTracking } from "../../blocks/page/collab/useCollabPositionTracking";
import { useCollabPositionReporter } from "../../blocks/page/collab/useCollabPositionReporter";
import { PageBlock } from "../../blocks/page/PageBlock";
import { PageTitle } from "../../blocks/page/PageTitle";
import { VersionDropdown } from "../../components/Dropdowns/VersionDropdown";
import { Button } from "../../components/forms/Button";
import { PageSidebar } from "../../components/layout/PageSidebar/PageSidebar";
import {
  GetPageQuery,
  GetPageQueryVariables,
} from "../../graphql/apiTypes.gen";
import styles from "../index.module.scss";
import { CollabPositionProvider } from "../../contexts/CollabPositionContext";
import PageTransferDropdown from "../../components/Dropdowns/PageTransferDropdown";
import MainComponentWithSidebar from "../../components/pages/MainComponentWithSidebar";

/**
 * @todo Remove when position tracking is fully implemented.
 * @example
 *
 *    localStorage.setItem("debug.collabToolbar", true); window.location.reload();
 */
const isCollabPositionDebugToolbarEnabled = (): boolean => {
  try {
    const rawValue = localStorage.getItem("debug.collabToolbar");
    return rawValue === "true" || rawValue === "1";
  } catch {
    return false;
  }
};

/**
 * preload all configured blocks for now. in the future these will be loaded
 * progressively from the block catalogue.
 */
const preloadedComponentIds = Object.keys(blockPaths);

// Apparently defining this is necessary in order to get server rendered props?
export const getStaticPaths: GetStaticPaths<{ slug: string }> = async () => {
  return {
    paths: [], // indicates that no page needs be created at build time
    fallback: "blocking", // indicates the type of fallback
  };
};

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

export const Page: VoidFunctionComponent<{ preloadedBlockMeta: BlockMeta[] }> =
  ({ preloadedBlockMeta }) => {
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
      if (pageState !== "normal") {
        setPageState("normal");
      }
    }, [router.asPath]);

    if (pageState === "transferring") {
      return (
        <MainComponentWithSidebar>
          <h1>Transferring you to the new page...</h1>
        </MainComponentWithSidebar>
      );
    }

    if (loading) {
      return (
        <MainComponentWithSidebar>
          <h1>Loading...</h1>
        </MainComponentWithSidebar>
      );
    }

    if (error) {
      return (
        <MainComponentWithSidebar>
          <h1>Error: {error.message}</h1>
        </MainComponentWithSidebar>
      );
    }

    if (!data) {
      return (
        <MainComponentWithSidebar>
          <h1>No data loaded.</h1>
        </MainComponentWithSidebar>
      );
    }

    const { title, contents } = data.page.properties;

    return (
      <MainComponentWithSidebar>
        {isCollabPositionDebugToolbarEnabled() ? (
          <div
            style={{
              background: "#eee",
              padding: 20,
              borderRadius: 5,
              marginBottom: 10,
              minHeight: 180,
            }}
          >
            <div>
              <Button
                onClick={() => {
                  reportPosition(
                    `${Math.round(Math.random() * 10000)}`.padStart(5, "0"),
                  );
                }}
              >
                report random block id
              </Button>{" "}
              <Button
                type="submit"
                onClick={() => {
                  reportPosition(null);
                }}
              >
                report empty block id
              </Button>
            </div>
            <h3 style={{ marginTop: 10 }}>Collaborator positions</h3>
            <ul>
              {collabPositions.map(({ userShortname, userId, entityId }) => (
                <li key={userId}>
                  <b>{userShortname}:</b> block #{entityId}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <header>
          <div className={styles.PageHeader}>
            <div>
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label>Title</label>
              <PageTitle
                value={title}
                accountId={data.page.accountId}
                metadataId={data.page.entityId}
              />
            </div>
            <div className={tw`mr-4`}>
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label>Transfer Page</label>
              <div>
                <PageTransferDropdown setPageState={setPageState} />
              </div>
            </div>
          </div>
        </header>

        <main>
          <CollabPositionProvider value={collabPositions}>
            <PageBlock
              accountId={data.page.accountId}
              contents={contents}
              blocksMeta={preloadedBlocks}
              entityId={data.page.entityId}
            />
          </CollabPositionProvider>
        </main>
      </MainComponentWithSidebar>
    );
  };

export default Page;
