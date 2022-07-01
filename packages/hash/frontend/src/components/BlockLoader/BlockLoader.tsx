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
import { useBlockProtocolCreateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntity";
import { useBlockProtocolCreateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { useBlockProtocolDeleteLink } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolUpdateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLink";
import { useBlockLoaded } from "../../blocks/onBlockLoaded";
import { useBlockProtocolCreateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregation";
import { useBlockProtocolUpdateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregation";
import { useBlockProtocolDeleteLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregation";
import { convertApiEntityToBpEntity } from "../../lib/entities";

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
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { uploadFile } = useFileUpload();
  const { updateLinkedAggregations } =
    useBlockProtocolUpdateLinkedAggregation();
  const { updateLinks } = useBlockProtocolUpdateLink();

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
    createEntities,
    createEntityTypes,
    createLinkedAggregations,
    createLinks,
    deleteLinkedAggregations,
    deleteLinks,
    /** @todo pick one of getEmbedBlock or fetchEmbedCode */
    getEmbedBlock: fetchEmbedCode,
    updateEntity,
    uploadFile,
    updateLinks,
    updateLinkedAggregations,
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
      graphCallbacks={functions as any}
      linkedAggregations={linkedAggregations as BpLinkedAggregation[]}
      onBlockLoaded={onRemoteBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
