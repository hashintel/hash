import React, { useMemo, VoidFunctionComponent } from "react";

import { useRemoteBlock } from "./useRemoteBlock";
import { HtmlBlock } from "../HtmlBlock/HtmlBlock";
import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";

type RemoteBlockProps = {
  url: string;
};

/**
 * @see https://github.com/Paciolan/remote-component/blob/2b2cfbb5b6006117c56f3aa7daa2292d3823bb83/src/createRemoteComponent.tsx
 */
export const RemoteBlock: VoidFunctionComponent<
  RemoteBlockProps & Record<string, any>
> = ({ url, ...props }) => {
  const [loading, err, Component] = useRemoteBlock(url);
  const { update } = useBlockProtocolUpdate();

  const flattenedProperties = useMemo(
    () => cloneEntityTreeWithPropertiesMovedUp(props),
    [props]
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  if (err || !Component) {
    return <div>Error: {(err || "UNKNOWN").toString()}</div>;
  }

  if (typeof Component === "string") {
    return <HtmlBlock html={Component} {...flattenedProperties} />;
  }

  return (
    <Component
      update={update}
      {...flattenedProperties}
      editableRef={props.editableRef}
    />
  );
};
