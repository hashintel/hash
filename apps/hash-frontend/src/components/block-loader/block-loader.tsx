import {
  BlockGraphProperties,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { EntityId } from "@local/hash-isomorphic-utils/types";
import { Subgraph as LocalSubgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";
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
  blockEntityTypeId: VersionedUri;
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
      (newBlockSubgraph) => setBlockSubgraph(newBlockSubgraph),
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
        ...args: Parameters<EmbedderGraphMessageCallbacks["updateEntity"]>
      ) => {
        const res = await updateEntity(...args);

        const newBlockSubgraph = await fetchBlockSubgraph(
          blockEntityTypeId,
          blockEntityId,
        );
        setBlockSubgraph(newBlockSubgraph);

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
    // @todo.0-3 fix this to import from @blockprotocol/graph when key mismatches are fixed
    const rootEntity = getRoots(
      graphProperties.blockEntitySubgraph as unknown as LocalSubgraph,
    )[0];

    if (!rootEntity) {
      throw new Error("Root entity not present in blockEntitySubgraph");
    }

    return {
      ...graphProperties,
      blockEntity: {
        entityId: rootEntity.metadata.editionId.baseId,
        properties: (rootEntity as any).properties, // @todo-0.3 fix this
      },
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
