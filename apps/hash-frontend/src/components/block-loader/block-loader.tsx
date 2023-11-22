import {
  BlockGraphProperties,
  GraphEmbedderMessageCallbacks,
  Subgraph as BpSubgraph,
} from "@blockprotocol/graph/temporal";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import {
  EntityStore,
  getDraftEntityByEntityId,
  textualContentPropertyTypeBaseUrl,
} from "@local/hash-isomorphic-utils/entity-store";
import { TextualContentPropertyValue } from "@local/hash-isomorphic-utils/system-types/shared";
import { UserPermissionsOnEntities } from "@local/hash-isomorphic-utils/types";
import {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRevisionId,
  EntityRootType,
  EntityVertex,
  isEntityId,
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
  entityStore?: EntityStore;
  /**
   * Properties to be used when the blockEntityId is not yet available for fetching the block from the API.
   * Used when new entities are created mid-session.
   */
  fallbackBlockProperties?: EntityPropertiesObject;
  onBlockLoaded: () => void;
  userPermissionsOnEntities?: UserPermissionsOnEntities;
  wrappingEntityId: string;
  readonly: boolean;
  // shouldSandbox?: boolean;
};

/**
 * Text fields use a `textual-content` property, with a value of either `Text` (a string)
 * or an opaque array of `Object`. This rewrite is so that the text can be stored as rich text tokens
 * by the embedding application, when the hook service is used, but also still received by
 * the block as a plain string (a predictable format), complying with the schema in both cases.
 * Here we translate our rich text tokens into a plain string for passing into the block.
 */
const rewrittenPropertiesForTextualContent = (
  properties: EntityPropertiesObject,
) => {
  const textTokens = properties[textualContentPropertyTypeBaseUrl] as
    | TextualContentPropertyValue
    | undefined;

  if (!textTokens || typeof textTokens === "string") {
    return properties;
  }

  return {
    ...properties,
    [textualContentPropertyTypeBaseUrl]: textTokens
      .map((token) =>
        "text" in token ? token.text : "hardBreak" in token ? "\n" : "",
      )
      .join(""),
  };
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
  entityStore,
  fallbackBlockProperties,
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
    blockSubgraph: possiblyStaleSubgraph,
    userPermissions,
    setUserPermissions,
  } = useBlockContext();
  const fetchBlockSubgraph = useFetchBlockSubgraph();

  /**
   * Rewrite the blockSubgraph for two purposes:
   * 1. Replace any entities which have a later edition in the entity store, if a store was provided.
   *    - some updates to entities are made via ProseMirror-related code to a local entity store, from which changes
   *      are periodically persisted to the API.
   *    - to ensure these changes are reflected in the block immediately, we replace any newer draft entities here
   *    - the better solution would be a single client-side entity store all components take their data from – see H-1351
   *      only the central store would deal with the API, and everything else would get the latest locally-held entities automatically
   * 2. Where the block entity has a textual-content property, ensure it is sent as a plain string, not our rich text representation
   */
  const blockSubgraph = useMemo(() => {
    if (!possiblyStaleSubgraph) {
      return null;
    }

    /**
     * The block subgraph should have a single root: the block entity. We'll default to the API-provided one,
     * but might need to replace it if there's a later version in the entity store, since the version is part of the root identifier
     */
    let roots: Subgraph<EntityRootType>["roots"] = possiblyStaleSubgraph.roots;

    const newVertices: Subgraph<EntityRootType>["vertices"] = {};

    /**
     * Check all the vertices and rebuild the vertices object to meet the two requirements for rewriting the subgraph.
     */
    for (const [entityIdOrTypeId, entityOrTypeEditionMap] of typedEntries(
      possiblyStaleSubgraph.vertices,
    )) {
      if (!isEntityId(entityIdOrTypeId)) {
        // This is a type, leave it be
        newVertices[entityIdOrTypeId] = entityOrTypeEditionMap;
        continue;
      }

      /**
       * We'll need to know if the entity is the block entity:
       * 1. To update the `roots` of the subgraph with the newer edition id, if the draft entity in the store is newer
       * 2. To rewrite the textual-content property to a plain string – only doing this for the block entity is an optimization
       *    to save us looking at the properties of every single edition in the subgraph, which we currently don't need for anything.
       */
      const isBlockEntity = roots[0]!.baseId === entityIdOrTypeId;

      /**
       * We need to know the latest edition of the entity in the subgraph:
       * 1. So we can compare it to the entity in the store, if the entity exists in the store
       * 2. So we can rewrite its textual-content property, if it is the block entity and it exists –
       *    doing so only for the latest edition is an optimization which assumes blocks only care about the latest value.
       */
      const latestSubgraphEditionTimestamp = Object.keys(entityOrTypeEditionMap)
        .sort()
        .pop() as EntityRevisionId;

      /**
       * Check if we have a version of this entity in the local store, if provided, and if it's newer than in the subgraph.
       */
      const entityInStore = entityStore
        ? getDraftEntityByEntityId(entityStore.draft, entityIdOrTypeId)
        : null;

      const draftEntityEditionTimestamp =
        entityInStore?.metadata.temporalVersioning.decisionTime.start.limit;

      const draftEntityIsNewer =
        draftEntityEditionTimestamp &&
        latestSubgraphEditionTimestamp < draftEntityEditionTimestamp;

      if (!entityInStore || !draftEntityIsNewer) {
        if (isBlockEntity) {
          // If it's the block entity, rewrite the textual-content property of the latest edition to a plain string
          newVertices[entityIdOrTypeId] = {
            ...entityOrTypeEditionMap,
            [latestSubgraphEditionTimestamp]: {
              kind: "entity",
              inner: {
                ...(
                  entityOrTypeEditionMap as Record<
                    EntityRevisionId,
                    EntityVertex
                  >
                )[latestSubgraphEditionTimestamp]!.inner,
                properties: rewrittenPropertiesForTextualContent(
                  (
                    entityOrTypeEditionMap as Record<
                      EntityRevisionId,
                      EntityVertex
                    >
                  )[latestSubgraphEditionTimestamp]!.inner.properties,
                ),
              },
            },
          };
        } else {
          // Don't bother to rewrite the textual-content property if it's not the block entity
          newVertices[entityIdOrTypeId] = entityOrTypeEditionMap;
        }
      } else {
        // The entity is in the store and the store version is newer – add the newer edition to the subgraph
        newVertices[entityIdOrTypeId] = {
          ...entityOrTypeEditionMap,
          [draftEntityEditionTimestamp as string]: {
            kind: "entity",
            inner: {
              ...entityInStore,
              properties: isBlockEntity
                ? entityInStore.properties
                : rewrittenPropertiesForTextualContent(
                    entityInStore.properties,
                  ),
              /**
               * This cast is necessary because the DraftEntity type has some missing fields (e.g. entityId)
               * to account for entities which are only in the local store, and not in the API.
               * Because this entity must exist in the API, since we have matched it on an entityId from the API,
               * we can safely cast it to the Entity type.
               *
               * Ideally the entity store would not have differences in the type to persisted entities,
               * which we should address when moving to a single global entity store – see H-1351.
               */
            } as Entity,
          } satisfies EntityVertex,
        };

        if (isBlockEntity) {
          /**
           * If the entity is the block entity, we also need to update the root of the subgraph to point to the newer edition.
           */
          roots = [
            {
              baseId: entityIdOrTypeId,
              revisionId: draftEntityEditionTimestamp as EntityRevisionId,
            },
          ];
        }
      }
    }

    return {
      ...possiblyStaleSubgraph,
      roots,
      vertices: newVertices,
    };
  }, [entityStore, possiblyStaleSubgraph]);

  const lastFetchedBlockEntityId = useRef(blockEntityId);

  /**
   * Set the initial block data from either:
   * - the block collection subgraph and permissions on entities in it, if provided
   * - via useFetchBlockSubgraph, which will fetch the block's data from the API if we have an entityId,
   *   or set a placeholder if not. The placeholder will use fallbackBlockProperties.
   */
  useEffect(() => {
    if (blockSubgraph && blockEntityId === lastFetchedBlockEntityId.current) {
      return;
    }

    lastFetchedBlockEntityId.current = blockEntityId;

    /**
     * If we have been given the block collection's subgraph or a permissions object, use its data first for quicker loading.
     * The block and its permissions may not be present in the subgraph if it was just created.
     */
    if (blockEntityId && blockCollectionSubgraph) {
      const entityEditionMap = blockCollectionSubgraph.vertices[blockEntityId];

      if (entityEditionMap) {
        /**
         * If the block's entity is in the block collection subgraph,
         * we can create a new subgraph with the block entity at the root to send to the block.
         * The traversal depths will not be accurate, because the actual traversal was rooted at the block collection.
         * This data is only used briefly – we fetch the block's subgraph from the API further on this effect.
         */
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
     * Fetch the block's subgraph and permissions to replace any initially loaded data.
     * When blocks are created mid-session, we cannot rely on their entity or permissions being in the block collection subgraph.
     * If we don't yet have a blockEntityId, fetchBlockSubgraph will provide a default.
     */
    void fetchBlockSubgraph(
      blockEntityTypeId,
      blockEntityId,
      fallbackBlockProperties,
    ).then((newBlockSubgraph) => {
      setBlockSubgraph(newBlockSubgraph.subgraph);
      setUserPermissions(newBlockSubgraph.userPermissionsOnEntities);
    });
  }, [
    blockEntityId,
    blockCollectionSubgraph,
    blockEntityTypeId,
    blockSubgraph,
    fallbackBlockProperties,
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

  const graphProperties = useMemo<Required<
    BlockGraphProperties["graph"]
  > | null>(
    () =>
      blockSubgraph
        ? {
            readonly:
              readonly || // is the entire page readonly?
              /**
               * If we have a blockEntityId, check if the user lacks edit permissions on the block entity.
               * If we don't have a blockEntityId, this is a newly created entity which the user should have edit permissions on.
               */
              !!(
                blockEntityId &&
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false positive on unsafe index access
                !userPermissions?.[blockEntityId]?.edit
              ),
            blockEntitySubgraph:
              blockSubgraph as unknown as BpSubgraph<EntityRootType>,
          }
        : null,
    [blockEntityId, blockSubgraph, readonly, userPermissions],
  );

  if (!graphProperties) {
    return null;
  }

  return (
    <RemoteBlock
      blockMetadata={blockMetadata}
      editableRef={editableRef}
      graphCallbacks={functions}
      graphProperties={graphProperties}
      onBlockLoaded={onRemoteBlockLoaded}
    />
  );
};
