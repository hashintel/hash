import {
  Entity as BpEntity,
  BlockGraphProperties,
  EntityType as BpEntityType,
  LinkedAggregation as BpLinkedAggregation,
} from "@blockprotocol/graph";
import { BlockConfig } from "@hashintel/hash-shared/blockMeta";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import React, { useCallback, useMemo, VoidFunctionComponent } from "react";

import {
  convertApiEntityToBpEntity,
  convertApiEntityTypesToBpEntityTypes,
  convertApiEntityTypeToBpEntityType,
  convertApiLinkedAggregationToBpLinkedAggregation,
  convertApiLinkGroupsToBpLinkGroups,
} from "../../lib/entities";
import { fetchEmbedCode } from "./fetchEmbedCode";
import { RemoteBlock } from "../RemoteBlock/RemoteBlock";
import { useBlockLoaded } from "../../blocks/onBlockLoaded";
import { useBlockProtocolAggregateEntities } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntities";
import { useBlockProtocolAggregateEntityTypes } from "../hooks/blockProtocolFunctions/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolCreateEntity } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntity";
import { useBlockProtocolCreateEntityType } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateEntityType";
import { useBlockProtocolCreateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLink";
import { useBlockProtocolCreateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolCreateLinkedAggregation";
import { useBlockProtocolDeleteLink } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLink";
import { useBlockProtocolDeleteLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolDeleteLinkedAggregation";
import { useBlockProtocolFileUpload } from "../hooks/blockProtocolFunctions/useBlockProtocolFileUpload";
import { useBlockProtocolUpdateEntity } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { useBlockProtocolUpdateEntityType } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateEntityType";
import { useBlockProtocolUpdateLink } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLink";
import { useBlockProtocolUpdateLinkedAggregation } from "../hooks/blockProtocolFunctions/useBlockProtocolUpdateLinkedAggregation";

type BlockLoaderProps = {
  accountId: string;
  blockEntityId: string;
  blockMetadata: BlockConfig;
  editableRef: unknown;
  entityId: string;
  entityTypeId: string;
  entityProperties: {};
  linkGroups: BlockEntity["properties"]["entity"]["linkGroups"];
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
  const { uploadFile } = useBlockProtocolFileUpload(accountId);
  const { updateEntityType } = useBlockProtocolUpdateEntityType();
  const { updateLinkedAggregation } = useBlockProtocolUpdateLinkedAggregation();

  const { updateLink } = useBlockProtocolUpdateLink();

  const graphProperties = useMemo<
    Required<BlockGraphProperties<Record<string, any>>["graph"]>
  >(() => {
    const convertedEntityTypesForProvidedEntities: BpEntityType[] = [];

    const convertedLinkedEntities: BpEntity[] = [];
    for (const entity of linkedEntities ?? []) {
      convertedLinkedEntities.push(convertApiEntityToBpEntity(entity));
      convertedEntityTypesForProvidedEntities.push(
        convertApiEntityTypeToBpEntityType(entity.entityType),
      );
    }

    const convertedLinkedAggregations: BpLinkedAggregation[] = [];
    for (const linkedAggregation of linkedAggregations ?? []) {
      convertedLinkedAggregations.push(
        convertApiLinkedAggregationToBpLinkedAggregation(linkedAggregation),
      );
      convertedEntityTypesForProvidedEntities.push(
        ...convertApiEntityTypesToBpEntityTypes(
          linkedAggregation.results.map(({ entityType }) => entityType),
        ),
      );
    }

    const blockEntity = convertApiEntityToBpEntity({
      accountId,
      entityId,
      entityTypeId,
      properties: entityProperties,
    });

    return {
      blockEntity,
      blockGraph: {
        depth: 1,
        linkGroups: convertApiLinkGroupsToBpLinkGroups(linkGroups),
        linkedEntities: convertedLinkedEntities,
      },
      entityTypes: convertedEntityTypesForProvidedEntities,
      linkedAggregations: convertedLinkedAggregations,
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

  const functions = {
    aggregateEntityTypes,
    aggregateEntities,
    createEntity,
    createEntityType,
    createLinkedAggregation,
    createLink,
    deleteLinkedAggregation,
    deleteLink,
    /**
     * @todo remove this when embed block no longer relies on server-side oEmbed calls
     * @see https://app.asana.com/0/1200211978612931/1202509819279267/f
     */
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
      blockMetadata={blockMetadata}
      editableRef={editableRef}
      graphCallbacks={functions}
      graphProperties={graphProperties}
      onBlockLoaded={onRemoteBlockLoaded}
      sourceUrl={sourceUrl}
    />
  );
};
