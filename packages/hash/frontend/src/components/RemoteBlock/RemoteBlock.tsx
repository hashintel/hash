import React, { VoidFunctionComponent } from "react";

import { useRemoteBlock } from "./useRemoteBlock";
import { HtmlBlock } from "../HtmlBlock/HtmlBlock";
import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { fetchEmbedCode } from "./fetchEmbedCode";

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

  console.log({ props });

  return (
    <Component
      // entityId={"f5544378-439d-4b38-a91c-1f126b8c2534"}
      accountId={"f5544378-439d-4b38-a91c-1f126b8c2534"}
      update={update}
      getEmbedBlock={fetchEmbedCode}
      {...props}
    />
  );
};
