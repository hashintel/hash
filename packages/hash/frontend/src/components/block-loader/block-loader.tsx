import {
  BlockGraphProperties,
  EntityEditionId,
  GraphResolveDepths,
  Subgraph,
  SubgraphRootTypes,
} from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { HashBlockMeta } from "@hashintel/hash-shared/blocks";
import { EntityId } from "@hashintel/hash-shared/types";
import { Subgraph as LocalSubgraph } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useBlockLoadedContext } from "../../blocks/on-block-loaded";
import { useIsReadonlyMode } from "../../shared/readonly-mode";
import { useBlockProtocolAggregateEntities } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-aggregate-entities";
import { useBlockProtocolGetEntity } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { useBlockProtocolUpdateEntity } from "../hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolFileUpload } from "../hooks/block-protocol-functions/use-block-protocol-file-upload";
import { RemoteBlock } from "../remote-block/remote-block";
import { fetchEmbedCode } from "./fetch-embed-code";

type BlockLoaderProps = {
  blockEntityId?: EntityId; // @todo make this always defined
  blockEntityTypeId: VersionedUri;
  blockMetadata: HashBlockMeta;
  editableRef: (node: HTMLElement | null) => void;
  onBlockLoaded: () => void;
  wrappingEntityId: string;
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
}) => {
  const isReadonlyMode = useIsReadonlyMode();
  const { aggregateEntities } = useBlockProtocolAggregateEntities();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { uploadFile } = useBlockProtocolFileUpload(isReadonlyMode);
  const [graphProperties, setGraphProperties] = useState<Required<
    BlockGraphProperties["graph"]
  > | null>(null);

  const { getEntity } = useBlockProtocolGetEntity();

  useEffect(() => {
    const depths: GraphResolveDepths = {
      hasRightEntity: {
        incoming: 2,
        outgoing: 2,
      },
      hasLeftEntity: {
        incoming: 2,
        outgoing: 2,
      },
    };

    if (!blockEntityId) {
      // when inserting a block in the frontend we don't yet have an entity associated with it
      // there's a delay while the request to the API to insert it is processed
      // @todo some better way of handling this – probably affected by revamped collab.
      //    or could simply not load a new block until the entity is created?
      const now: string = new Date().toISOString();
      const placeholderEntity = {
        metadata: {
          editionId: {
            baseId: "placeholder-account%entity-id-not-set",
            version: now, // @todo-0.3 check this against types in @blockprotocol/graph when mismatches fixed
            versionId: now,
          },
          entityTypeId: blockEntityTypeId,
        },

        properties: {},
      };
      const blockEntitySubgraph = {
        depths,
        edges: {},
        roots: [placeholderEntity.metadata.editionId as any as EntityEditionId], // @todo-0.3 fix when type mismatches fixed
        vertices: {
          [placeholderEntity.metadata.editionId.baseId]: {
            [now]: {
              kind: "entity",
              inner: placeholderEntity,
            },
          },
        } as unknown as Subgraph["vertices"], // @todo-0.3 do something about this
      };
      setGraphProperties({
        blockEntitySubgraph,
        readonly: isReadonlyMode,
      });
      return;
    }

    getEntity({
      data: { entityId: blockEntityId },
    })
      .then(({ data, errors }) => {
        if (!data) {
          throw new Error(
            `Could not get entity ${blockEntityId} ${
              errors ? JSON.stringify(errors, null, 2) : ""
            }`,
          );
        }

        setGraphProperties({
          blockEntitySubgraph: {
            ...(data as unknown as Subgraph<SubgraphRootTypes["entity"]>), // @todo-0.3 do something about this,
            roots: [
              // @todo-0.3 remove this when edition ids match between HASH and BP
              {
                ...data.roots[0]!,
                versionId: data.roots[0]!.version,
              },
            ],
          },
          readonly: isReadonlyMode,
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- intentional debug log until we have better user-facing errors
        console.error(err);
        throw err;
      });
  }, [blockEntityId, blockEntityTypeId, getEntity, isReadonlyMode]);

  const functions = {
    aggregateEntities,
    /**
     * @todo remove this when embed block no longer relies on server-side oEmbed calls
     * @see https://app.asana.com/0/1200211978612931/1202509819279267/f
     */
    getEmbedBlock: fetchEmbedCode,
    updateEntity,
    uploadFile,
  };

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

  // The paragraph block needs updating to 0.3 and publishing – this ensures it doesn't crash
  // @todo-0.3 remove this when the paragraph block is updated to 0.3
  const temporaryBackwardsCompatibleProperties = useMemo(() => {
    if (!graphProperties) {
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
