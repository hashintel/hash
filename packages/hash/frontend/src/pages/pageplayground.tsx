import React, { useEffect, VFC } from "react";
import { GetStaticProps } from "next";
import { PageBlock } from "../blocks/page/PageBlock";
import {
  content as contentsWithoutMetadata,
  preloadedBlocksUrls,
} from "../blocks/page/content.json";
import {
  addBlockMetadata,
  Block,
  blockCache,
  BlockMeta,
  fetchBlockMeta,
} from "../blocks/page/tsUtils";

export const getStaticProps: GetStaticProps = async (context) => {
  const preloadedBlockMeta = await Promise.all(
    preloadedBlocksUrls?.map((url) => fetchBlockMeta(url)) ?? []
  );

  const contents = await Promise.all(
    contentsWithoutMetadata?.map(addBlockMetadata) ?? []
  );

  return { props: { contents, preloadedBlockMeta } };
};

const PagePlayground: VFC<{
  contents: Block[];
  preloadedBlockMeta: BlockMeta[];
}> = ({ contents, preloadedBlockMeta }) => {
  useEffect(() => {
    for (const { componentMetadata, componentSchema } of contents) {
      blockCache.set(componentMetadata.url, {
        componentMetadata,
        componentSchema,
      });
    }
  }, [contents]);

  const preloadedBlocks = new Map(
    preloadedBlockMeta.map(
      (node) => [node.componentMetadata.url, node] as const
    )
  );

  return <PageBlock contents={contents} blocksMeta={preloadedBlocks} />;
};

export default PagePlayground;
