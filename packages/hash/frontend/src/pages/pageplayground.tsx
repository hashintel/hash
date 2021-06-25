import React, { VFC } from "react";
import { GetStaticProps } from "next";
import { addBlockManifest, Block, PageBlock } from "../blocks/page/PageBlock";
import contentsWithoutManifest from "../blocks/page/content.json";

export const getStaticProps: GetStaticProps = async (context) => {
  const contents = await Promise.all(
    contentsWithoutManifest.map(addBlockManifest)
  );

  return { props: { contents } };
};

const PagePlayground: VFC<{ contents: Block[] }> = ({ contents }) => (
  <PageBlock contents={contents} />
);

export default PagePlayground;
