import React, { useMemo, VoidFunctionComponent } from "react";
import { BlockProtocolUpdatePayload } from "@hashintel/block-protocol";

import { useRemoteBlock } from "./useRemoteBlock";
import { HtmlBlock } from "../HtmlBlock/HtmlBlock";
import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { uploadImage } from "./uploadImage";

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

  /**
   * Temporary hack to provide the accountId for blocks.
   * Assumes that the accountId of the block entity will be the same as
   * all entities it is rendering / in its tree. Unsafe assumption.
   * @todo Replace with a proper mapping of entities to accountIds.
   */
  const updateWithAccountId = (
    updateData: BlockProtocolUpdatePayload<any>[]
  ) => {
    update([
      {
        ...updateData[0],
        accountId: props.accountId,
      },
    ]).catch((err) => console.error("Could not update entity: ", err));
  };

  return (
    <Component
      /** @todo have this passed in to RemoteBlock as entityId, not childEntityId */
      {...flattenedProperties}
      update={updateWithAccountId}
      getEmbedBlock={fetchEmbedCode}
      editableRef={props.editableRef}
      entityId={props.childEntityId}
      uploadImage={uploadImage}
    />
  );
};
