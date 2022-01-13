import React, { VoidFunctionComponent } from "react";
import { BlockProtocolProps } from "blockprotocol";

import { useRemoteBlock } from "./useRemoteBlock";
import { HtmlBlock } from "../HtmlBlock/HtmlBlock";

type RemoteBlockProps = {
  crossFrame?: boolean;
  sourceUrl: string;
  onBlockLoaded?: () => void;
} & BlockProtocolProps;

export const BlockLoadingIndicator: VoidFunctionComponent = () => (
  <div>Loading...</div>
);

/**
 * @see https://github.com/Paciolan/remote-component/blob/2b2cfbb5b6006117c56f3aa7daa2292d3823bb83/src/createRemoteComponent.tsx
 */
export const RemoteBlock: VoidFunctionComponent<
  RemoteBlockProps & Record<string, any>
> = ({ crossFrame, sourceUrl, onBlockLoaded, ...props }) => {
  const [loading, err, Component] = useRemoteBlock(
    sourceUrl,
    crossFrame,
    onBlockLoaded,
  );

  if (loading) {
    return <BlockLoadingIndicator />;
  }

  if (err || !Component) {
    return <div>Error: {(err || "UNKNOWN").toString()}</div>;
  }

  if (typeof Component === "string") {
    /**
     * This HTML block has no props available to it, unless loaded via FramedBlock.
     * @todo do something about this. throw if not in an iframe?
     *    or check for iframe status and assign props to window here, not FramedBlock?
     */
    return <HtmlBlock html={Component} />;
  }

  return <Component {...props} />;
};
