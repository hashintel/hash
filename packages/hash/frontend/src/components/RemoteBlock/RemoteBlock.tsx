import React, { VoidFunctionComponent } from "react";

import { useRemoteBlock } from "./useRemoteBlock";
import { HtmlBlock } from "../HtmlBlock/HtmlBlock";
import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";

type RemoteBlockProps = {
  url: string;
};

/**
 * @see https://github.com/Paciolan/remote-component/blob/2b2cfbb5b6006117c56f3aa7daa2292d3823bb83/src/createRemoteComponent.tsx
 */
export const RemoteBlock: VoidFunctionComponent<RemoteBlockProps> = ({
  url,
  ...props
}) => {
  const [loading, err, Component] = useRemoteBlock(url);
  const { update } = useBlockProtocolUpdate();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (err || !Component) {
    return <div>Error: {(err || "UNKNOWN").toString()}</div>;
  }

  if (typeof Component === "string") {
    return <HtmlBlock html={Component} {...props} />;
  }

  return <Component update={update} {...props} />;
};
