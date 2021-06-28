import React, { VFC } from "react";
import { GetStaticProps } from "next";
import { PageBlock } from "../blocks/page/PageBlock";
import contentsWithoutMetadata from "../blocks/page/content.json";
import { addBlockMetadata, Block } from "../blocks/page/tsUtils";

export const getStaticProps: GetStaticProps = async (context) => {
  // const contents = await Promise.all(
  //   contentsWithoutMetadata?.map(addBlockMetadata) ?? null
  // );

  return { props: { contents: null } };
};

const PagePlayground: VFC<{ contents: Block[] | null }> = ({ contents }) => (
  <PageBlock contents={contents} />
);

export default PagePlayground;
