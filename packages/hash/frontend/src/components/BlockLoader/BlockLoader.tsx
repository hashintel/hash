import React, { useMemo, VoidFunctionComponent } from "react";

import { useBlockProtocolUpdate } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { uploadFile } from "./uploadFile";
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
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
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes(
    props.accountId,
  );
  const { update } = useBlockProtocolUpdate(props.accountId);
  const { aggregate } = useBlockProtocolAggregate(props.accountId);

  const flattenedProperties = useMemo(
    () => cloneEntityTreeWithPropertiesMovedUp(props),
    [props],
  );

  const blockProperties = {
    ...flattenedProperties,
    editableRef: props.editableRef,
    /** @todo have this passed in to RemoteBlock as entityId, not childEntityId */
    entityId: props.childEntityId,
  };

  const functions = {
    aggregateEntityTypes,
    update,
    aggregate,
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
