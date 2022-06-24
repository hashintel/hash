import React, { useCallback, useMemo, VoidFunctionComponent } from "react";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { BlockProtocolLinkedAggregation } from "blockprotocol";

import { useBlockProtocolUpdateEntity } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
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
import { useBlockProtocolCreateEntityType } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntityType";
import { useBlockProtocolCreateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntitities";
import { useBlockProtocolCreateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { useBlockProtocolDeleteLink } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolUpdateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLink";
import { useBlockLoaded } from "../../blocks/onBlockLoaded";
import { useBlockProtocolCreateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregation";
import { useBlockProtocolUpdateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregation";
import { useBlockProtocolDeleteLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregation";

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
  const { createLinkedAggregations } =
    useBlockProtocolCreateLinkedAggregation();
  const { createLinks } = useBlockProtocolCreateLink();
  const { createEntities } = useBlockProtocolCreateEntities();
  const { createEntityTypes } = useBlockProtocolCreateEntityType();
  const { deleteLinkedAggregations } =
    useBlockProtocolDeleteLinkedAggregation();
  const { deleteLinks } = useBlockProtocolDeleteLink();
  const { updateEntities } = useBlockProtocolUpdateEntity();
  const { uploadFile } = useFileUpload();
  const { updateLinkedAggregations } =
    useBlockProtocolUpdateLinkedAggregation();
  const { updateLinks } = useBlockProtocolUpdateLink();

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
    createEntities,
    createEntityTypes,
    createLinkedAggregations,
    createLinks,
    deleteLinkedAggregations,
    deleteLinks,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
    updateEntities,
    uploadFile,
    updateLinks,
    updateLinkedAggregations,
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
      blockProperties={{
        ...blockProperties,
        entityId: blockProperties.entityId ?? null,
        entityTypeId: blockProperties.entityTypeId ?? null,
        entityTypeVersionId: blockProperties.entityTypeVersionId ?? null,
        linkedAggregations:
          blockProperties.linkedAggregations as BlockProtocolLinkedAggregation[],
      }}
      blockFunctions={functions}
      editableRef={editableRef}
      onBlockLoaded={onRemoteBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
