import {
  BlockGraphProperties,
  EntityRootType,
  GraphEmbedderMessageCallbacks,
  Subgraph,
} from "@blockprotocol/graph/temporal";
import { getRoots } from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { TEXT_TOKEN_PROPERTY_TYPE_BASE_URL } from "@local/hash-isomorphic-utils/entity-store";
import {
  BaseUrl,
  Entity,
  EntityId,
  EntityPropertiesObject,
} from "@local/hash-subgraph";
import {
  FunctionComponent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { useBlockLoadedContext } from "../../blocks/on-block-loaded";
import { useFetchBlockSubgraph } from "../../blocks/use-fetch-block-subgraph";
import { useBlockContext } from "../../pages/shared/block-collection/block-context";
import { WorkspaceContext } from "../../pages/shared/workspace-context";
import { useBlockProtocolArchiveEntity } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolFileUpload } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-file-upload";
import { useBlockProtocolGetEntity } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { useBlockProtocolQueryEntities } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { useBlockProtocolUpdateEntity } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { RemoteBlock } from "../remote-block/remote-block";
import { fetchEmbedCode } from "./fetch-embed-code";

export type BlockLoaderProps = {
  blockEntityId?: EntityId; // @todo make this always defined
  blockEntityTypeId: VersionedUrl;
  blockMetadata: HashBlockMeta;
  editableRef: ((node: HTMLElement | null) => void) | null;
  onBlockLoaded: () => void;
  wrappingEntityId: string;
  readonly: boolean;
  // shouldSandbox?: boolean;
};

// const sandboxingEnabled = !!process.env.NEXT_PUBLIC_SANDBOX;

/**
 * Converts API data to Block Protocol-formatted data (e.g. entities, links),
 * and passes the correctly formatted data to RemoteBlock, along with message callbacks
 */
export const BlockLoader: FunctionComponent<BlockLoaderProps> = ({
  blockEntityId,
  blockEntityTypeId,
  blockMetadata,
  editableRef,
  onBlockLoaded,
  // shouldSandbox,
  wrappingEntityId,
  readonly,
}) => {
  const { activeWorkspaceOwnedById } = useContext(WorkspaceContext);

  const { queryEntities } = useBlockProtocolQueryEntities();
  const { createEntity } = useBlockProtocolCreateEntity(
    activeWorkspaceOwnedById ?? null,
    readonly,
  );
  const { archiveEntity: deleteEntity } = useBlockProtocolArchiveEntity();
  const { getEntity } = useBlockProtocolGetEntity();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { uploadFile } = useBlockProtocolFileUpload(
    activeWorkspaceOwnedById,
    readonly,
  );

  const { setBlockSubgraph, blockSubgraph } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  useEffect(() => {
    void fetchBlockSubgraph(blockEntityTypeId, blockEntityId).then(
      (newBlockSubgraph) => {
        setBlockSubgraph(
          newBlockSubgraph as unknown as Subgraph<EntityRootType>,
        );
      },
    );
  }, [fetchBlockSubgraph, blockEntityId, blockEntityTypeId, setBlockSubgraph]);

  const functions = useMemo(
    () => ({
      queryEntities,
      /**
       * @todo remove this when embed block no longer relies on server-side oEmbed calls
       * @see https://app.asana.com/0/1200211978612931/1202509819279267/f
       */
      getEmbedBlock: fetchEmbedCode,
      createEntity,
      deleteEntity,
      getEntity,
      uploadFile,
      updateEntity: async (
        ...args: Parameters<GraphEmbedderMessageCallbacks["updateEntity"]>
      ) => {
        const [messageData] = args;
        const res = await updateEntity(
          messageData.data
            ? {
                data: {
                  ...messageData.data,
                  entityId: messageData.data.entityId as EntityId,
                },
              }
            : {},
        );

        const newBlockSubgraph = await fetchBlockSubgraph(
          blockEntityTypeId,
          blockEntityId,
        );

        setBlockSubgraph(
          newBlockSubgraph as unknown as Subgraph<EntityRootType>,
        );

        return res;
      },
    }),
    [
      queryEntities,
      setBlockSubgraph,
      fetchBlockSubgraph,
      createEntity,
      deleteEntity,
      getEntity,
      updateEntity,
      blockEntityId,
      blockEntityTypeId,
      uploadFile,
    ],
  );

  const onBlockLoadedFromContext = useBlockLoadedContext().onBlockLoaded;
  const onBlockLoadedRef = useRef(onBlockLoaded);

  useLayoutEffect(() => {
    onBlockLoadedRef.current = onBlockLoaded;
  });

  const onRemoteBlockLoaded = useCallback(() => {
    onBlockLoadedFromContext(wrappingEntityId);
    onBlockLoadedRef.current();
  }, [wrappingEntityId, onBlockLoadedFromContext]);

  // @todo upgrade sandbox for BP 0.3 and remove feature flag
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

  const graphProperties = useMemo<BlockGraphProperties["graph"] | null>(
    () =>
      blockSubgraph
        ? {
            readonly,
            blockEntitySubgraph: blockSubgraph,
          }
        : null,
    [blockSubgraph, readonly],
  );

  // The paragraph block needs updating to 0.3 and publishing – this ensures it doesn't crash
  // @todo-0.3 remove this when the paragraph block is updated to 0.3
  const temporaryBackwardsCompatibleProperties = useMemo(() => {
    if (!graphProperties) {
      return null;
    }

    const rootEntity = getRoots(graphProperties.blockEntitySubgraph)[0] as
      | Entity
      | undefined;

    if (!rootEntity) {
      throw new Error("Root entity not present in blockEntitySubgraph");
    }

    /**
     * Our text blocks ask for a BP `textual-content` property, which is plain `Text`.
     * Because they use the hook service, we actually generate text as text tokens and persist it under a different property.
     * The BP spec says that blocks should receive the data they expect even if the hook service is used
     * – this code makes sure we provide rich text as a plain string for this specific property.
     * It is useful for making sure that blocks have string fallbacks in contexts where the hook service is not available,
     * which at the time of writing (May 2023) is when viewing/editing a page in 'canvas' mode.
     *
     * This code has the following issues:
     * 1. It assumes that any entity with `tokens` stored on it is actually expected as `textual-content`
     *   - we should instead be able to identify which property on the entity the hook service was used for
     * 2. It does not do this translation for any entities that are not the root entity
     * @todo address the issues described above
     */

    const newProperties: EntityPropertiesObject = { ...rootEntity.properties };

    const textTokens = rootEntity.properties[
      TEXT_TOKEN_PROPERTY_TYPE_BASE_URL as BaseUrl
    ] as TextToken[] | undefined;

    if (textTokens) {
      newProperties[
        "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/" as BaseUrl
      ] = textTokens
        .map((token) =>
          "text" in token ? token.text : "hardBreak" in token ? "\n" : "",
        )
        .join("");
    }

    return {
      ...graphProperties,
      blockEntity: {
        entityId: rootEntity.metadata.recordId.entityId,
        properties: newProperties,
      },
      blockEntitySubgraph: graphProperties.blockEntitySubgraph,
      readonly: !!graphProperties.readonly,
    };
  }, [graphProperties]);

  if (!temporaryBackwardsCompatibleProperties) {
    return null;
  }

  return (
    <RemoteBlock
      blockMetadata={blockMetadata}
      editableRef={editableRef}
      graphCallbacks={functions}
      graphProperties={temporaryBackwardsCompatibleProperties}
      onBlockLoaded={onRemoteBlockLoaded}
    />
  );
};
