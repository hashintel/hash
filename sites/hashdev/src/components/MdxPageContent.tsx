// @todo update from blockprotocol
import { MDXRemote, MDXRemoteSerializeResult } from "next-mdx-remote";
import { FunctionComponent } from "react";
import { mdxComponents } from "../util/mdxComponents";

type MdxPageContentProps = {
  serializedPage: MDXRemoteSerializeResult<Record<string, unknown>>;
};

export const MdxPageContent: FunctionComponent<MdxPageContentProps> = ({
  serializedPage,
}) => {
  // @ts-expect-error @todo fix this
  return <MDXRemote {...serializedPage} components={mdxComponents} />;
};
