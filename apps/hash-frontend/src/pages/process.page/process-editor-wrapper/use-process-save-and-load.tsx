import { useMutation } from "@apollo/client";
import type {
  EntityId,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
} from "@blockprotocol/type-system";
import type {
  PetriNetDefinitionObject,
  TransitionNodeType,
} from "@hashintel/petrinaut-old";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  blockProtocolDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  PetriNetPropertiesWithMetadata,
  SubProcessOfPropertiesWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/petrinet";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";

import type {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  CreateEntityMutation,
  CreateEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  archiveEntityMutation,
  createEntityMutation,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { useActiveWorkspace } from "../../shared/workspace-context";
import { updateSubProcessDefinitionForParentPlaces } from "./use-process-save-and-load/update-sub-process-nodes";
import {
  getPersistedNetsFromSubgraph,
  usePersistedNets,
} from "./use-process-save-and-load/use-persisted-nets";

const areSetsEquivalent = (a: Set<string>, b: Set<string>) => {
  if (a.size !== b.size) {
    return false;
  }

  return a.isSubsetOf(b);
};

export type PersistedNet = {
  entityId: EntityId;
  title: string;
  definition: PetriNetDefinitionObject;
  parentNet: { parentNetId: EntityId; title: string } | null;
  childNetLinksByNodeIdAndChildNetId: {
    [nodeId: string]: {
      [childNetId: string]: {
        linkEntityId: EntityId;
      };
    };
  };
  userEditable: boolean;
};

type UseProcessSaveAndLoadParams = {
  parentNet: { parentNetId: EntityId; title: string } | null;
  petriNet: PetriNetDefinitionObject;
  selectedNetId: EntityId | null;
  setParentNet: Dispatch<
    SetStateAction<{ parentNetId: EntityId; title: string } | null>
  >;
  setPetriNet: Dispatch<SetStateAction<PetriNetDefinitionObject>>;
  setSelectedNetId: Dispatch<SetStateAction<EntityId | null>>;
  setTitle: Dispatch<SetStateAction<string>>;
  title: string;
};

export const useProcessSaveAndLoad = ({
  parentNet,
  petriNet,
  selectedNetId,
  setParentNet,
  setSelectedNetId,
  setPetriNet,
  setTitle,
  title,
}: UseProcessSaveAndLoadParams): {
  discardChanges: (() => void) | null;
  isDirty: boolean;
  loadPersistedNet: (net: PersistedNet) => void;
  persistedNets: PersistedNet[];
  persistPending: boolean;
  persistToGraph: () => void;
  setUserEditable: Dispatch<SetStateAction<boolean>>;
  userEditable: boolean;
} => {
  const { persistedNets, refetch } = usePersistedNets();

  const { activeWorkspaceWebId } = useActiveWorkspace();

  const [persistPending, setPersistPending] = useState(false);

  const [userEditable, setUserEditable] = useState(true);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

  const persistedNet = useMemo(() => {
    return persistedNets.find((net) => net.entityId === selectedNetId);
  }, [persistedNets, selectedNetId]);

  const isDirty = useMemo(() => {
    if (!persistedNet) {
      return true;
    }

    if (title !== persistedNet.title) {
      return true;
    }

    if (parentNet?.parentNetId !== persistedNet.parentNet?.parentNetId) {
      return true;
    }

    if (petriNet.arcs.length !== persistedNet.definition.arcs.length) {
      return true;
    }

    if (petriNet.nodes.length !== persistedNet.definition.nodes.length) {
      return true;
    }

    if (
      petriNet.tokenTypes.length !== persistedNet.definition.tokenTypes.length
    ) {
      return true;
    }

    if (
      JSON.stringify(petriNet.arcs.map(({ selected: _, ...arc }) => arc)) !==
      JSON.stringify(persistedNet.definition.arcs)
    ) {
      return true;
    }

    if (
      JSON.stringify(petriNet.nodes) !==
      JSON.stringify(persistedNet.definition.nodes)
    ) {
      return true;
    }

    if (
      JSON.stringify(petriNet.tokenTypes) !==
      JSON.stringify(persistedNet.definition.tokenTypes)
    ) {
      return true;
    }

    return false;
  }, [petriNet, persistedNet, title, parentNet]);

  const loadPersistedNet = useCallback(
    (net: PersistedNet) => {
      setSelectedNetId(net.entityId);
      setParentNet(net.parentNet);
      setPetriNet(net.definition);
      setTitle(net.title);
      setUserEditable(net.userEditable);
    },
    [setParentNet, setPetriNet, setSelectedNetId, setTitle, setUserEditable],
  );

  const refetchPersistedNets = useCallback(
    async ({ updatedEntityId }: { updatedEntityId: EntityId | null }) => {
      const updatedNetsData = await refetch();

      const transformedNets = getPersistedNetsFromSubgraph(
        updatedNetsData.data,
      );

      if (updatedEntityId) {
        const updatedNet = transformedNets.find(
          (net) => net.entityId === updatedEntityId,
        );

        if (updatedNet) {
          loadPersistedNet(updatedNet);
        }
      }
    },
    [loadPersistedNet, refetch],
  );

  const persistToGraph = useCallback(async () => {
    if (!activeWorkspaceWebId) {
      return;
    }

    setPersistPending(true);

    let persistedEntityId = selectedNetId;

    if (selectedNetId) {
      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: selectedNetId,
            propertyPatches: [
              {
                op: "replace",
                path: [
                  systemPropertyTypes.definitionObject.propertyTypeBaseUrl,
                ],
                property: {
                  metadata: {
                    dataTypeId: blockProtocolDataTypes.object.dataTypeId,
                  },
                  // @ts-expect-error -- incompatibility between JsonValue and some of the Edge types
                  // @todo fix this
                  value: {
                    arcs: petriNet.arcs,
                    nodes: petriNet.nodes,
                    tokenTypes: petriNet.tokenTypes,
                  } satisfies PetriNetDefinitionObject,
                },
              },
              {
                op: "replace",
                path: [systemPropertyTypes.title.propertyTypeBaseUrl],
                property: {
                  metadata: {
                    dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  },
                  value: title,
                },
              },
            ],
          },
        },
      });
    } else {
      const createdEntityData = await createEntity({
        variables: {
          entityTypeIds: [systemEntityTypes.petriNet.entityTypeId],
          webId: activeWorkspaceWebId,
          properties: {
            value: {
              "https://hash.ai/@h/types/property-type/definition-object/": {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.object.dataTypeId,
                },
                value: {
                  arcs: petriNet.arcs,
                  nodes: petriNet.nodes,
                  tokenTypes: petriNet.tokenTypes,
                } satisfies PetriNetDefinitionObject,
              },
              "https://hash.ai/@h/types/property-type/title/": {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                },
                value: title,
              },
            },
          } satisfies PetriNetPropertiesWithMetadata as PropertyObjectWithMetadata,
        },
      });

      if (!createdEntityData.data?.createEntity) {
        throw new Error("Failed to create petri net");
      }

      const createdEntity = new HashEntity(createdEntityData.data.createEntity);

      persistedEntityId = createdEntity.entityId;
    }

    if (!persistedEntityId) {
      throw new Error("Somehow no entityId available after persisting net");
    }

    /**
     * If we have to make changes to places in a linked sub-process, we will need this.
     * and it's cheaper to build it once here rather than finding labels repeatedly as and when we need them.
     * There shouldn't be many places, so it doesn't really matter if we don't end up needing it.
     */
    const placeLabelsById: Record<string, string> = {};
    for (const node of petriNet.nodes) {
      if (node.data.type === "place") {
        placeLabelsById[node.id] = node.data.label;
      }
    }

    /**
     * Handle sub-process changes. For any sub-process changed on a transition:
     * 1. Archive the previous sub-process, if there was one
     * 2. Create a new link to the new sub-process, if there is one
     */
    for (const node of petriNet.nodes) {
      if (node.data.type !== "transition") {
        continue;
      }

      const previousTransition = persistedNet?.definition.nodes.find(
        (transition): transition is TransitionNodeType =>
          transition.data.type === "transition" && transition.id === node.id,
      );

      const previousChildNetReference = previousTransition?.data.childNet;

      const oldChildNetId = previousChildNetReference?.childNetId;
      const newChildNetId = node.data.childNet?.childNetId;

      const childNetIdentityHasChanged = oldChildNetId !== newChildNetId;

      const existingLinkEntityId = oldChildNetId
        ? persistedNet?.childNetLinksByNodeIdAndChildNetId[node.id]?.[
            oldChildNetId
          ]?.linkEntityId
        : null;

      /**
       * Archive the link to the previous sub-process, if it has changed.
       */
      if (
        childNetIdentityHasChanged &&
        existingLinkEntityId &&
        previousChildNetReference
      ) {
        await archiveEntity({
          variables: { entityId: existingLinkEntityId },
        });

        const previousChildNet = persistedNets.find(
          (net) => net.entityId === previousChildNetReference.childNetId,
        );

        if (!previousChildNet) {
          throw new Error(
            `Sub-process ${previousChildNetReference.childNetId} not found`,
          );
        }

        /**
         * Get the new nodes for the sub-process, with any links to parent places removed.
         */
        const updatedChildNetNodes = updateSubProcessDefinitionForParentPlaces({
          subProcessNet: previousChildNet,
          inputPlaceLabelById: {},
          outputPlaceLabelById: {},
        });

        if (updatedChildNetNodes) {
          await updateEntity({
            variables: {
              entityUpdate: {
                entityId: previousChildNet.entityId,
                propertyPatches: [
                  {
                    op: "replace",
                    path: [
                      systemPropertyTypes.definitionObject.propertyTypeBaseUrl,
                    ],
                    property: {
                      // @ts-expect-error -- incompatibility between JsonValue and some of the Edge types
                      // @todo fix this
                      value: {
                        ...previousChildNet.definition,
                        nodes: updatedChildNetNodes,
                      } satisfies PetriNetDefinitionObject,
                      metadata: {
                        dataTypeId: blockProtocolDataTypes.object.dataTypeId,
                      },
                    },
                  },
                ],
              },
            },
          });
        }
      }

      const childNetDefinition = persistedNets.find(
        (net) => net.entityId === newChildNetId,
      );

      if (newChildNetId && !childNetDefinition) {
        throw new Error(`Sub-process ${newChildNetId} not found`);
      }

      /**
       * Create the link from the sub-process to the parent process, if it has changed.
       */
      if (childNetIdentityHasChanged && newChildNetId && node.data.childNet) {
        await createEntity({
          variables: {
            entityTypeIds: [
              systemLinkEntityTypes.subProcessOf.linkEntityTypeId,
            ],
            linkData: {
              leftEntityId: newChildNetId as EntityId,
              rightEntityId: persistedEntityId,
            },
            properties: {
              value: {
                "https://hash.ai/@h/types/property-type/transition-id/": {
                  metadata: {
                    dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  },
                  value: node.id,
                },
                "https://hash.ai/@h/types/property-type/input-place-id/": {
                  value: node.data.childNet.inputPlaceIds.map((id) => ({
                    metadata: {
                      dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                    },
                    value: id,
                  })),
                },
                "https://hash.ai/@h/types/property-type/output-place-id/": {
                  value: node.data.childNet.outputPlaceIds.map((id) => ({
                    metadata: {
                      dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                    },
                    value: id,
                  })),
                },
              },
            } satisfies SubProcessOfPropertiesWithMetadata as PropertyObjectWithMetadata,
            webId: activeWorkspaceWebId,
          },
        });
      }

      if (!node.data.childNet || !childNetDefinition) {
        /**
         * If there is no linked sub-process now, we are done for this transition node.
         */
        continue;
      }

      /**
       * If there is a linked sub-process, we need to check if the selected input or output places for the parent transition node have changed,
       * so that we can make sure they are represented in the sub-process.
       */
      const childNetInputPlaceIdsChanged = !areSetsEquivalent(
        new Set<string>(node.data.childNet.inputPlaceIds),
        new Set<string>(previousTransition?.data.childNet?.inputPlaceIds ?? []),
      );

      const childNetOutputPlaceIdsChanged = !areSetsEquivalent(
        new Set<string>(node.data.childNet.outputPlaceIds),
        new Set<string>(
          previousTransition?.data.childNet?.outputPlaceIds ?? [],
        ),
      );

      if (childNetInputPlaceIdsChanged || childNetOutputPlaceIdsChanged) {
        if (existingLinkEntityId) {
          /**
           * If we already have a link, we need to update the existing link entity to represent the new input and output places.
           */
          const propertyPatches: PropertyPatchOperation[] = [];

          if (childNetInputPlaceIdsChanged) {
            propertyPatches.push({
              op: "replace",
              path: [systemPropertyTypes.inputPlaceId.propertyTypeBaseUrl],
              property: {
                value: node.data.childNet.inputPlaceIds.map((id) => ({
                  metadata: {
                    dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  },
                  value: id,
                })),
              },
            });
          }

          if (childNetOutputPlaceIdsChanged) {
            propertyPatches.push({
              op: "replace",
              path: [systemPropertyTypes.outputPlaceId.propertyTypeBaseUrl],
              property: {
                value: node.data.childNet.outputPlaceIds.map((id) => ({
                  metadata: {
                    dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  },
                  value: id,
                })),
              },
            });
          }

          await updateEntity({
            variables: {
              entityUpdate: {
                entityId: existingLinkEntityId,
                propertyPatches,
              },
            },
          });
        }

        /**
         * Now we need to ensure that the input and output places in the parent process are represented in the sub-process.
         */
        const inputPlaceLabelById: Record<string, string> = {};
        const outputPlaceLabelById: Record<string, string> = {};

        for (const placeId of node.data.childNet.inputPlaceIds) {
          const label = placeLabelsById[placeId];

          if (!label) {
            throw new Error(`Place ${placeId} not found when looking up label`);
          }

          inputPlaceLabelById[placeId] = label;
        }

        for (const placeId of node.data.childNet.outputPlaceIds) {
          const label = placeLabelsById[placeId];

          if (!label) {
            throw new Error(`Place ${placeId} not found when looking up label`);
          }

          outputPlaceLabelById[placeId] = label;
        }

        const newNodes = updateSubProcessDefinitionForParentPlaces({
          subProcessNet: childNetDefinition,
          inputPlaceLabelById,
          outputPlaceLabelById,
        });

        if (!newNodes) {
          /**
           * No changes to the sub-process necessary.
           */
          continue;
        }

        await updateEntity({
          variables: {
            entityUpdate: {
              entityId: childNetDefinition.entityId,
              propertyPatches: [
                {
                  op: "replace",
                  path: [
                    systemPropertyTypes.definitionObject.propertyTypeBaseUrl,
                  ],
                  property: {
                    // @ts-expect-error -- incompatibility between JsonValue and some of the Edge types
                    // @todo fix this
                    value: {
                      ...childNetDefinition.definition,
                      nodes: newNodes,
                    } satisfies PetriNetDefinitionObject,
                    metadata: {
                      dataTypeId: blockProtocolDataTypes.object.dataTypeId,
                    },
                  },
                },
              ],
            },
          },
        });
      }
    }

    await refetchPersistedNets({ updatedEntityId: persistedEntityId });
    setSelectedNetId(persistedEntityId);
    setUserEditable(true);

    setPersistPending(false);
  }, [
    activeWorkspaceWebId,
    archiveEntity,
    createEntity,
    persistedNet?.definition.nodes,
    persistedNet?.childNetLinksByNodeIdAndChildNetId,
    persistedNets,
    petriNet.arcs,
    petriNet.nodes,
    petriNet.tokenTypes,
    refetchPersistedNets,
    selectedNetId,
    setSelectedNetId,
    title,
    updateEntity,
  ]);

  const discardChanges = useMemo(() => {
    if (!persistedNet) {
      return null;
    }

    return () => loadPersistedNet(persistedNet);
  }, [persistedNet, loadPersistedNet]);

  return useMemo(
    () => ({
      discardChanges,
      isDirty,
      loadPersistedNet,
      persistedNets,
      persistPending,
      persistToGraph,
      setUserEditable,
      userEditable,
    }),
    [
      discardChanges,
      isDirty,
      loadPersistedNet,
      persistPending,
      persistedNets,
      persistToGraph,
      setUserEditable,
      userEditable,
    ],
  );
};
