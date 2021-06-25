import React, { VFC } from "react";
import { GetStaticProps } from "next";
import { addBlockMetadata, Block, PageBlock } from "../blocks/page/PageBlock";
import contentsWithoutMetadata from "../blocks/page/content.json";

export const getStaticProps: GetStaticProps = async (context) => {
  const contents = await Promise.all(
    contentsWithoutMetadata.map(addBlockMetadata)
  );

  return { props: { contents } };
};

const PagePlayground: VFC<{ contents: Block[] }> = ({ contents }) => (
  <PageBlock contents={contents} />
);

export default PagePlayground;
