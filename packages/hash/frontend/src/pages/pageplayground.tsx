import React, { useEffect, VFC } from "react";
import { GetStaticProps } from "next";
import { PageBlock } from "../blocks/page/PageBlock";
import contentsWithoutMetadata from "../blocks/page/content.json";
import { addBlockMetadata, Block, blockCache } from "../blocks/page/tsUtils";

export const getStaticProps: GetStaticProps = async (context) => {
  const contents = await Promise.all(
    contentsWithoutMetadata?.map(addBlockMetadata) ?? null
  );

  return { props: { contents } };
};

const PagePlayground: VFC<{ contents: Block[] | null }> = ({ contents }) => {
  useEffect(() => {
    if (contents) {
      for (const {
        componentId,
        componentMetadata,
        componentSchema,
      } of contents) {
        blockCache.set(componentId, { componentMetadata, componentSchema });
      }
    }
  }, [contents]);

  return <PageBlock contents={contents} />;
};

export default PagePlayground;
