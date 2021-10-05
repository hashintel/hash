import { useMemo, VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { useQuery } from "@apollo/client";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { GetStaticPaths, GetStaticProps } from "next";
import {
  BlockMeta,
  blockPaths,
  fetchBlockMeta,
} from "@hashintel/hash-shared/sharedWithBackend";
import {
  GetPageQuery,
  GetPageQueryVariables,
} from "../../graphql/apiTypes.gen";
import { PageBlock } from "../../blocks/page/PageBlock";
import { PageSidebar } from "../../components/layout/PageSidebar/PageSidebar";

import styles from "../index.module.scss";
import { VersionDropdown } from "../../components/Dropdowns/VersionDropdown";

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
      []
  );

  return { props: { preloadedBlockMeta } };
};

export const Page: VoidFunctionComponent<{ preloadedBlockMeta: BlockMeta[] }> =
  ({ preloadedBlockMeta }) => {
    const router = useRouter();

    // metadataId is the consistent identifier for pages (across all versions)
    const metadataId = router.query.pageId as string;
    const accountId = router.query.accountId as string;
    // versionId is an optional param for requesting a specific page version
    const versionId = router.query.version as string | undefined;

    const { data, error } = useQuery<GetPageQuery, GetPageQueryVariables>(
      getPageQuery,
      {
        variables: { metadataId, accountId, versionId },
      }
    );

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
                : 0
            )
            .map((node) => [node.componentMetadata.componentId, node] as const)
        ),
      [preloadedBlockMeta]
    );

    if (error) {
      return <h1>Error: {error.message}</h1>;
    }

    if (!data) {
      return <h1>No data loaded.</h1>;
    }

    const { title, contents } = data.page.properties;

    return (
      <div className={styles.MainWrapper}>
        <PageSidebar />
        <div className={styles.MainContent}>
          <header>
            <div className={styles.PageHeader}>
              <div>
                <label>Title</label>
                <h1>{title}</h1>
              </div>
              <div>
                <label>Version</label>
                <div>
                  <VersionDropdown
                    value={data.page.entityVersionId}
                    versions={data.page.history ?? []}
                    onChange={(changedVersionId) => {
                      void router.push(
                        `/${accountId}/${metadataId}?version=${changedVersionId}`
                      );
                    }}
                  />
                </div>
              </div>
            </div>
          </header>

          <main>
            <PageBlock
              accountId={data.page.accountId}
              contents={contents}
              blocksMeta={preloadedBlocks}
              metadataId={data.page.metadataId}
            />
          </main>
        </div>
      </div>
    );
  };

export default Page;
