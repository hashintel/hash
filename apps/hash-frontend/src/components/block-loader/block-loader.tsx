import {
  BlockGraphProperties,
  GraphEmbedderMessageCallbacks,
  Subgraph as BpSubgraph,
} from "@blockprotocol/graph/temporal";
import { getRoots } from "@blockprotocol/graph/temporal/stdlib";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { textualContentPropertyTypeBaseUrl } from "@local/hash-isomorphic-utils/entity-store";
import { TextualContentPropertyValue } from "@local/hash-isomorphic-utils/system-types/shared";
import { UserPermissionsOnEntities } from "@local/hash-isomorphic-utils/types";
import {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRevisionId,
  EntityRootType,
  Subgraph,
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
  blockCollectionSubgraph?: Subgraph<EntityRootType>;
  blockEntityId?: EntityId; // @todo make this always defined
  blockEntityTypeId: VersionedUrl;
  blockMetadata: HashBlockMeta;
  editableRef: ((node: HTMLElement | null) => void) | null;
  onBlockLoaded: () => void;
  userPermissionsOnEntities?: UserPermissionsOnEntities;
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
  blockCollectionSubgraph,
  blockEntityId,
  blockEntityTypeId,
  blockMetadata,
  editableRef,
  onBlockLoaded,
  // shouldSandbox,
  wrappingEntityId,
  readonly,
  userPermissionsOnEntities,
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

  const {
    setBlockSubgraph,
    blockSubgraph,
    userPermissions,
    setUserPermissions,
  } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  /**
   * Set the initial block data from either:
   * - the block collection subgraph and permissions on entities in it, if provided
   * - fetching the block's subgraph manually
   */
  useEffect(() => {
    if (blockSubgraph || !blockEntityId) {
      return;
    }

    /**
     * If we have been given the block collection's subgraph or a permissions object, use its data first for quicker loading.
     * The block and its permissions may not be present in the subgraph if it was just created.
     */
    if (blockCollectionSubgraph) {
      const entityEditionMap = blockCollectionSubgraph.vertices[blockEntityId];

      if (entityEditionMap) {
        // The block isn't in the page subgraph – it might have just been created
        const latestEditionId = Object.keys(entityEditionMap).sort().pop()!;
        const initialBlockSubgraph = {
          ...blockCollectionSubgraph,
          roots: [
            {
              baseId: blockEntityId,
              revisionId: latestEditionId as EntityRevisionId,
            },
          ],
        };
        setBlockSubgraph(initialBlockSubgraph);
      }

      if (userPermissionsOnEntities) {
        setUserPermissions(userPermissionsOnEntities);
      }
    }

    /**
     * Fetch the block's proper subgraph and permissions to replace any initially loaded data.
     * When blocks are created mid-session, we cannot rely on their entity or permissions being in the block collection subgraph,
     */
    void fetchBlockSubgraph(blockEntityTypeId, blockEntityId).then(
      (newBlockSubgraph) => {
        setBlockSubgraph(newBlockSubgraph.subgraph);
        setUserPermissions(newBlockSubgraph.userPermissionsOnEntities);
      },
    );
  }, [
    blockEntityId,
    blockCollectionSubgraph,
    blockEntityTypeId,
    blockSubgraph,
    fetchBlockSubgraph,
    setBlockSubgraph,
    setUserPermissions,
    userPermissionsOnEntities,
  ]);

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

        setBlockSubgraph(newBlockSubgraph.subgraph);
        setUserPermissions(newBlockSubgraph.userPermissionsOnEntities);

        return res;
      },
    }),
    [
      queryEntities,
      setBlockSubgraph,
      fetchBlockSubgraph,
      setUserPermissions,
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
            readonly:
              readonly || // is the entire page readonly?
              !blockEntityId ||
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false positive on unsafe index access
              !userPermissions?.[blockEntityId]?.edit, // does the user lack edit permissions on the block entity?
            blockEntitySubgraph:
              blockSubgraph as unknown as BpSubgraph<EntityRootType>,
          }
        : null,
    [blockEntityId, blockSubgraph, readonly, userPermissions],
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
     * Text fields use a `textual-content` property, with a value of either `Text` (a string)
     * or an opaque array of `Object`. This is so that the text can be stored as rich text tokens
     * by the embedding application, when the hook service is used, but also still received by
     * the block as a plain string (a predictable format), complying with the schema in both cases.
     * Here we translate our rich text tokens into a plain string for passing into the block.
     *
     * This code has the following issues:
     * 1. It assumes that any entity with `textual-content` stored on it expects the value to be a string
     *   - we should instead be able to identify which property on the entity the hook service was used for
     * 2. It does not do this translation for any entities that are not the root entity
     * @todo address the issues described above
     */

    const newProperties: EntityPropertiesObject = { ...rootEntity.properties };

    const textTokens = rootEntity.properties[
      textualContentPropertyTypeBaseUrl
    ] as TextualContentPropertyValue | undefined;

    if (textTokens && typeof textTokens !== "string") {
      newProperties[textualContentPropertyTypeBaseUrl] = textTokens
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
