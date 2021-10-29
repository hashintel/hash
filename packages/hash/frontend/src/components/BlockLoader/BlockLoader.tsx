import React, { useMemo, VoidFunctionComponent } from "react";
import {
  BlockProtocolAggregatePayload,
  BlockProtocolUpdatePayload,
} from "@hashintel/block-protocol";

import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { uploadFile } from "./uploadFile";
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregate } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregate";

type BlockLoaderProps = {
  shouldSandbox?: boolean;
  sourceUrl: string;
} & Record<string, any>;

const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

export const BlockLoader: VoidFunctionComponent<BlockLoaderProps> = ({
  sourceUrl,
  shouldSandbox,
  ...props
}) => {
  const { update } = useBlockProtocolUpdate();
  const { aggregate } = useBlockProtocolAggregate();

  const flattenedProperties = useMemo(
    () => cloneEntityTreeWithPropertiesMovedUp(props),
    [props]
  );

  /**
   * Temporary hack to provide the accountId for blocks.
   * Assumes that the accountId of the block entity will be the same as
   * all entities it is rendering / in its tree. Unsafe assumption.
   * @todo Replace with a proper mapping of entities to accountIds.
   */
  const updateWithAccountId = (
    updateData: BlockProtocolUpdatePayload<any>[]
  ): Promise<any[]> => {
    return update([
      {
        ...updateData[0],
        accountId: props.accountId,
      },
    ]).catch((updateError) => {
      console.error("Could not update entity: ", updateError);
      throw updateError;
    });
  };

  // @todo type this to be better
  const aggregateWithAccountId = (
    action: BlockProtocolAggregatePayload
  ): Promise<any> => {
    return aggregate({
      ...action,
      accountId: props.accountId,
    }).catch((aggregateError) => {
      console.error("Cout not perform aggregation: ", aggregateError);
      throw aggregateError;
    });
  };

  const blockProperties = {
    ...flattenedProperties,
    editableRef: props.editableRef,
    /** @todo have this passed in to RemoteBlock as entityId, not childEntityId */
    entityId: props.childEntityId,
  };

  const functions = {
    update: updateWithAccountId,
    aggregate: aggregateWithAccountId,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
    uploadFile,
  };

  if (sandboxingEnabled && (shouldSandbox || sourceUrl.endsWith(".html"))) {
    return (
      <BlockFramer
        sourceUrl={sourceUrl}
        blockProperties={blockProperties}
        {...functions}
      />
    );
  }

  return (
    <RemoteBlock {...blockProperties} {...functions} sourceUrl={sourceUrl} />
  );
};
