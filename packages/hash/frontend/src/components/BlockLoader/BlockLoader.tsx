import {
  Entity,
  LinkedAggregation as BpLinkedAggregation,
} from "@blockprotocol/graph";
import { BlockConfig } from "@hashintel/hash-shared/blockMeta";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import React, { useCallback, useMemo, VoidFunctionComponent } from "react";

import { useBlockProtocolUpdateEntity } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolAggregateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useFileUpload } from "../hooks/useFileUpload";
import { LinkedAggregation, LinkGroup } from "../../graphql/apiTypes.gen";
import { useBlockProtocolCreateEntityType } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntityType";
import { useBlockProtocolCreateEntity } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntity";
import { useBlockProtocolCreateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { useBlockProtocolDeleteLink } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolUpdateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLink";
import { useBlockLoaded } from "../../blocks/onBlockLoaded";
import { useBlockProtocolCreateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregation";
import { useBlockProtocolUpdateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregation";
import { useBlockProtocolDeleteLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregation";
import { convertApiEntityToBpEntity } from "../../lib/entities";
import { useBlockProtocolUpdateEntityType } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntityType";

type BlockLoaderProps = {
  accountId: string;
  blockEntityId: string;
  blockMetadata: BlockConfig;
  editableRef: unknown;
  entityId: string;
  entityTypeId: string;
  entityProperties: {};
  linkGroups: LinkGroup[];
  linkedEntities: BlockEntity["properties"]["entity"]["linkedEntities"];
  linkedAggregations: BlockEntity["properties"]["entity"]["linkedAggregations"];
  // shouldSandbox?: boolean;
  sourceUrl: string;
};

// const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

/**
 * Converts API data to Block Protocol-formatted data (e.g. entities, links),
 * and passes the correctly formatted data to RemoteBlock, along with message callbacks
 */
export const BlockLoader: VoidFunctionComponent<BlockLoaderProps> = ({
  accountId,
  blockEntityId,
  blockMetadata,
  editableRef,
  entityId,
  entityTypeId,
  entityProperties,
  linkGroups,
  linkedEntities,
  linkedAggregations,
  // shouldSandbox,
  sourceUrl,
}) => {
  const { aggregateEntityTypes } =
    useBlockProtocolAggregateEntityTypes(accountId);
  const { aggregateEntities } = useBlockProtocolAggregateEntities(accountId);
  const { createLinkedAggregation } = useBlockProtocolCreateLinkedAggregation();
  const { createLink } = useBlockProtocolCreateLink();
  const { createEntity } = useBlockProtocolCreateEntity(accountId);
  const { createEntityType } = useBlockProtocolCreateEntityType(accountId);
  const { deleteLinkedAggregation } = useBlockProtocolDeleteLinkedAggregation();
  const { deleteLink } = useBlockProtocolDeleteLink();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { uploadFile } = useFileUpload();
  const { updateEntityType } = useBlockProtocolUpdateEntityType();
  const { updateLinkedAggregation } = useBlockProtocolUpdateLinkedAggregation();
  const { updateLink } = useBlockProtocolUpdateLink();

  const flattenedProperties = useMemo(() => {
    let convertedLinkedEntities: Entity[] = [];

    if (linkedEntities) {
      convertedLinkedEntities = linkedEntities.map(convertApiEntityToBpEntity);
    }

    const convertedRootEntity = convertApiEntityToBpEntity({
      accountId,
      entityId,
      entityTypeId,
      properties: entityProperties,
    });

    return {
      ...convertedRootEntity,
      linkGroups,
      linkedEntities: convertedLinkedEntities,
      linkedAggregations: linkedAggregations as LinkedAggregation[],
      properties: entityProperties,
    };
  }, [
    accountId,
    entityId,
    entityProperties,
    entityTypeId,
    linkGroups,
    linkedEntities,
    linkedAggregations,
  ]);

  const blockProperties = {
    ...flattenedProperties,
    entityId,
    entityTypeId,
  };

  const functions = {
    aggregateEntityTypes,
    aggregateEntities,
    createEntity,
    createEntityType,
    createLinkedAggregation,
    createLink,
    deleteLinkedAggregation,
    deleteLink,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
    updateEntity,
    updateEntityType,
    uploadFile,
    updateLink,
    updateLinkedAggregation,
  };

  const onBlockLoaded = useBlockLoaded();

  const onRemoteBlockLoaded = useCallback(() => {
    onBlockLoaded(blockEntityId);
  }, [blockEntityId, onBlockLoaded]);

  // @todo upgrade sandbox for BP 0.2 and remove feature flag
  // if (sandboxingEnabled && (shouldSandbox || sourceUrl.endsWith(".html"))) {
  //   return (
  //     <BlockFramer
  //       sourceUrl={sourceUrl}
  //       blockProperties={{
  //         ...blockProperties,
  //         entityId: blockProperties.entityId ?? null,
  //         entityTypeId: blockProperties.entityTypeId ?? null,
  //       }}
  //       onBlockLoaded={onRemoteBlockLoaded}
  //       {...functions}
  //     />
  //   );
  // }

  return (
    <RemoteBlock
      blockEntity={{
        entityId: blockProperties.entityId ?? null,
        entityTypeId: blockProperties.entityTypeId ?? null,
        properties: blockProperties.properties,
      }}
      blockGraph={{ depth: 1, linkGroups, linkedEntities }}
      blockMetadata={blockMetadata}
      editableRef={editableRef}
      graphCallbacks={functions}
      linkedAggregations={linkedAggregations as BpLinkedAggregation[]}
      onBlockLoaded={onRemoteBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
