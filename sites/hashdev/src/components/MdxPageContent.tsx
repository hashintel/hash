// @todo update from blockprotocol
import { MDXRemote, MDXRemoteSerializeResult } from "next-mdx-remote";
import { VFC } from "react";
import { mdxComponents } from "../util/mdxComponents";

type MdxPageContentProps = {
  serializedPage: MDXRemoteSerializeResult<Record<string, unknown>>;
};

export const MdxPageContent: VFC<MdxPageContentProps> = ({
  serializedPage,
}) => {
  // @ts-expect-error @todo fix this
  return <MDXRemote {...serializedPage} components={mdxComponents} />;
};
