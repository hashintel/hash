import {
  BlockGraphProperties,
  EntityRootType,
  GraphEmbedderMessageCallbacks,
  Subgraph,
} from "@blockprotocol/graph/temporal";
import { getRoots } from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { Entity, EntityId } from "@local/hash-subgraph";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { useBlockLoadedContext } from "../../blocks/on-block-loaded";
import { useBlockContext } from "../../blocks/page/block-context";
import { useFetchBlockSubgraph } from "../../blocks/use-fetch-block-subgraph";
import { useBlockProtocolAggregateEntities } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-aggregate-entities";
import { useBlockProtocolFileUpload } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-file-upload";
import { useBlockProtocolUpdateEntity } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { RemoteBlock } from "../remote-block/remote-block";
import { fetchEmbedCode } from "./fetch-embed-code";

type BlockLoaderProps = {
  blockEntityId?: EntityId; // @todo make this always defined
  blockEntityTypeId: VersionedUrl;
  blockMetadata: HashBlockMeta;
  editableRef: (node: HTMLElement | null) => void;
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
  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { uploadFile } = useBlockProtocolFileUpload(readonly);

  const { setBlockSubgraph, blockSubgraph } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  useEffect(() => {
    void fetchBlockSubgraph(blockEntityTypeId, blockEntityId).then(
      (newBlockSubgraph) =>
        setBlockSubgraph(
          newBlockSubgraph as unknown as Subgraph<EntityRootType>,
        ),
    );
  }, [fetchBlockSubgraph, blockEntityId, blockEntityTypeId, setBlockSubgraph]);

  const functions = useMemo(
    () => ({
      aggregateEntities,
      /**
       * @todo remove this when embed block no longer relies on server-side oEmbed calls
       * @see https://app.asana.com/0/1200211978612931/1202509819279267/f
       */
      getEmbedBlock: fetchEmbedCode,
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
      aggregateEntities,
      setBlockSubgraph,
      fetchBlockSubgraph,
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

  const graphProperties = useMemo<BlockGraphProperties["graph"]>(
    () => ({
      readonly,
      blockEntitySubgraph: blockSubgraph,
    }),
    [blockSubgraph, readonly],
  );

  // The paragraph block needs updating to 0.3 and publishing – this ensures it doesn't crash
  // @todo-0.3 remove this when the paragraph block is updated to 0.3
  const temporaryBackwardsCompatibleProperties = useMemo(() => {
    if (!graphProperties.blockEntitySubgraph) {
      return null;
    }
    const rootEntity = getRoots(graphProperties.blockEntitySubgraph)[0] as
      | Entity
      | undefined;

    if (!rootEntity) {
      throw new Error("Root entity not present in blockEntitySubgraph");
    }

    return {
      ...graphProperties,
      blockEntity: {
        entityId: rootEntity.metadata.recordId.entityId,
        properties: rootEntity.properties,
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
