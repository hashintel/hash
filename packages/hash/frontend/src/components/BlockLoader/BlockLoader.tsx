import React, { useCallback, useMemo, VoidFunctionComponent } from "react";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { BlockProtocolLinkedAggregation } from "blockprotocol";

import { useBlockProtocolUpdateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntities";
import { cloneEntityTreeWithPropertiesMovedUp } from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { BlockFramer } from "../sandbox/BlockFramer/BlockFramer";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useFileUpload } from "../hooks/useFileUpload";
import {
  LinkedAggregation,
  LinkGroup,
  UnknownEntity,
} from "../../graphql/apiTypes.gen";
import { useBlockProtocolCreateLinks } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinks";
import { useBlockProtocolDeleteLinks } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinks";
import { useBlockProtocolUpdateLinks } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinks";
import { useBlockLoaded } from "../../blocks/onBlockLoaded";
import { useBlockProtocolCreateLinkedAggregations } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregations";
import { useBlockProtocolUpdateLinkedAggregations } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregations";
import { useBlockProtocolDeleteLinkedAggregations } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregations";

type BlockLoaderProps = {
  accountId: string;
  blockEntityId: string;
  editableRef: unknown;
  entityId: string;
  entityTypeId: string | undefined;
  entityTypeVersionId: string | undefined;
  entityProperties: {};
  linkGroups: LinkGroup[];
  linkedEntities: BlockEntity["properties"]["entity"]["linkedEntities"];
  linkedAggregations: BlockEntity["properties"]["entity"]["linkedAggregations"];
  shouldSandbox?: boolean;
  sourceUrl: string;
};

const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

export const BlockLoader: VoidFunctionComponent<BlockLoaderProps> = ({
  accountId,
  blockEntityId,
  editableRef,
  entityId,
  entityTypeId,
  entityTypeVersionId,
  entityProperties,
  linkGroups,
  linkedEntities,
  linkedAggregations,
  shouldSandbox,
  sourceUrl,
}) => {
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const { updateEntities } = useBlockProtocolUpdateEntities();
  const { uploadFile } = useFileUpload();
  const { createLinks } = useBlockProtocolCreateLinks();
  const { updateLinks } = useBlockProtocolUpdateLinks();
  const { deleteLinks } = useBlockProtocolDeleteLinks();
  const { createLinkedAggregations } =
    useBlockProtocolCreateLinkedAggregations();
  const { updateLinkedAggregations } =
    useBlockProtocolUpdateLinkedAggregations();
  const { deleteLinkedAggregations } =
    useBlockProtocolDeleteLinkedAggregations();

  const flattenedProperties = useMemo(() => {
    let flattenedLinkedEntities: UnknownEntity[] = [];

    if (linkedEntities) {
      flattenedLinkedEntities = linkedEntities.map((linkedEntity) => {
        return cloneEntityTreeWithPropertiesMovedUp(linkedEntity);
      }) as UnknownEntity[];
    }

    return cloneEntityTreeWithPropertiesMovedUp({
      accountId,
      linkGroups,
      linkedEntities: flattenedLinkedEntities,
      linkedAggregations: linkedAggregations as LinkedAggregation[],
      properties: entityProperties,
    });
  }, [
    accountId,
    entityProperties,
    linkGroups,
    linkedEntities,
    linkedAggregations,
  ]);

  const blockProperties = {
    ...flattenedProperties,
    entityId,
    entityTypeId,
    entityTypeVersionId,
  };

  const functions = {
    aggregateEntityTypes,
    aggregateEntities,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
    updateEntities,
    uploadFile,
    createLinks,
    updateLinks,
    deleteLinks,
    createLinkedAggregations,
    updateLinkedAggregations,
    deleteLinkedAggregations,
  };

  const onBlockLoaded = useBlockLoaded();

  const onRemoteBlockLoaded = useCallback(() => {
    onBlockLoaded(blockEntityId);
  }, [blockEntityId, onBlockLoaded]);

  if (sandboxingEnabled && (shouldSandbox || sourceUrl.endsWith(".html"))) {
    return (
      <BlockFramer
        sourceUrl={sourceUrl}
        blockProperties={{
          ...blockProperties,
          entityId: blockProperties.entityId ?? null,
          entityTypeId: blockProperties.entityTypeId ?? null,
          entityTypeVersionId: blockProperties.entityTypeVersionId ?? null,
        }}
        onBlockLoaded={onRemoteBlockLoaded}
        {...functions}
      />
    );
  }

  return (
    <RemoteBlock
      {...blockProperties}
      {...functions}
      linkedAggregations={
        blockProperties.linkedAggregations as BlockProtocolLinkedAggregation[]
      }
      editableRef={editableRef}
      onBlockLoaded={onRemoteBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
