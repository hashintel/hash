import { useMutation } from "@apollo/client";
import type {
  EntityId,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
} from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
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
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useReactFlow } from "reactflow";

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
import { updateSubProcessDefinitionForParentPlaces } from "./editor-context/sub-process-nodes";
import {
  getPersistedNetsFromSubgraph,
  usePersistedNets,
} from "./editor-context/use-persisted-nets";
import { defaultTokenTypes } from "./token-types";
import type {
  ArcType,
  NodeType,
  PersistedNet,
  PetriNetDefinitionObject,
  TokenType,
  TransitionNodeType,
} from "./types";

type EditorContextValue = {
  arcs: ArcType[];
  discardChanges: null | (() => void);
  isDirty: boolean;
  entityId: EntityId | null;
  nodes: NodeType[];
  parentProcess: { entityId: EntityId; title: string } | null;
  persistedNets: PersistedNet[];
  persistPending: boolean;
  persistToGraph: () => void;
  refetchPersistedNets: (args: { updatedEntityId: EntityId | null }) => void;
  setArcs: Dispatch<SetStateAction<ArcType[]>>;
  setEntityId: Dispatch<SetStateAction<EntityId | null>>;
  setNodes: Dispatch<SetStateAction<NodeType[]>>;
  setParentProcess: Dispatch<
    SetStateAction<{ entityId: EntityId; title: string } | null>
  >;
  setPetriNetDefinition: (params: PetriNetDefinitionObject) => void;
  setUserEditable: Dispatch<SetStateAction<boolean>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setTokenTypes: Dispatch<SetStateAction<TokenType[]>>;
  switchToNet: (persistedNet: PersistedNet) => void;
  title: string;
  tokenTypes: TokenType[];
  userEditable: boolean;
};

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

const stripUnwantedProperties = (node: NodeType) => {
  const { selected: _, dragging: __, ...rest } = node;

  return rest;
};

const areSetsEquivalent = (a: Set<string>, b: Set<string>) => {
  if (a.size !== b.size) {
    return false;
  }

  return a.isSubsetOf(b);
};

export const EditorContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [entityId, setEntityId] = useState<EntityId | null>(null);

  const [userEditable, setUserEditable] = useState<boolean>(true);

  const [nodes, setNodes] = useState<NodeType[]>([]);

  const [arcs, setArcs] = useState<ArcType[]>([]);

  const [tokenTypes, setTokenTypes] = useState<TokenType[]>(defaultTokenTypes);

  const [title, setTitle] = useState<string>("Process");

  const [parentProcess, setParentProcess] = useState<{
    entityId: EntityId;
    title: string;
  } | null>(null);

  const { persistedNets, refetch } = usePersistedNets();

  const { activeWorkspaceWebId } = useActiveWorkspace();

  const [persistPending, setPersistPending] = useState(false);

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

  const { fitView } = useReactFlow();

  const setPetriNetDefinition: EditorContextValue["setPetriNetDefinition"] =
    useCallback(
      ({ nodes: newNodes, arcs: newArcs, tokenTypes: newTokenTypes }) => {
        /**
         * We flush this update first because reactflow seems to take an extra render to clear the nodes and edges,
         * and there's a crash if the token types are cleared in the same cycle as the nodes/arcs (which depend on the types).
         */
        flushSync(() => {
          setArcs(newArcs);
          setNodes(newNodes);
        });

        setTokenTypes(newTokenTypes);

        setTimeout(() => {
          fitView({ duration: 200, padding: 0.03, maxZoom: 1 });
        }, 100);
      },
      [fitView, setArcs, setNodes, setTokenTypes],
    );

  const persistedNet = useMemo(() => {
    return persistedNets.find((net) => net.entityId === entityId);
  }, [persistedNets, entityId]);

  const isDirty = useMemo(() => {
    if (!persistedNet) {
      return true;
    }

    if (title !== persistedNet.title) {
      return true;
    }

    if (parentProcess?.entityId !== persistedNet.parentProcess?.entityId) {
      return true;
    }

    if (arcs.length !== persistedNet.definition.arcs.length) {
      return true;
    }

    if (nodes.length !== persistedNet.definition.nodes.length) {
      return true;
    }

    if (tokenTypes.length !== persistedNet.definition.tokenTypes.length) {
      return true;
    }

    if (
      JSON.stringify(arcs.map(({ selected: _, ...arc }) => arc)) !==
      JSON.stringify(persistedNet.definition.arcs)
    ) {
      return true;
    }

    if (
      JSON.stringify(nodes.map(stripUnwantedProperties)) !==
      JSON.stringify(persistedNet.definition.nodes)
    ) {
      return true;
    }

    if (
      JSON.stringify(tokenTypes) !==
      JSON.stringify(persistedNet.definition.tokenTypes)
    ) {
      return true;
    }

    return false;
  }, [arcs, nodes, tokenTypes, persistedNet, title, parentProcess]);

  const [switchTargetPendingConfirmation, setSwitchTargetPendingConfirmation] =
    useState<PersistedNet | null>(null);

  const loadPersistedNet = useCallback(
    (net: PersistedNet) => {
      setSwitchTargetPendingConfirmation(null);
      setEntityId(net.entityId);
      setParentProcess(net.parentProcess);
      setPetriNetDefinition(net.definition);
      setTitle(net.title);
      setUserEditable(net.userEditable);
    },
    [
      setEntityId,
      setParentProcess,
      setPetriNetDefinition,
      setTitle,
      setUserEditable,
    ],
  );

  const switchToNet = useCallback(
    (net: PersistedNet) => {
      if (isDirty) {
        setSwitchTargetPendingConfirmation(net);
      } else {
        loadPersistedNet(net);
      }
    },
    [isDirty, loadPersistedNet],
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

    let persistedEntityId = entityId;

    if (entityId) {
      await updateEntity({
        variables: {
          entityUpdate: {
            entityId,
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
                    arcs,
                    nodes: nodes.map(stripUnwantedProperties),
                    tokenTypes,
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
                  arcs,
                  nodes: nodes.map(stripUnwantedProperties),
                  tokenTypes,
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
    for (const node of nodes) {
      if (node.data.type === "place") {
        placeLabelsById[node.id] = node.data.label;
      }
    }

    /**
     * Handle sub-process changes. For any sub-process changed on a transition:
     * 1. Archive the previous sub-process, if there was one
     * 2. Create a new link to the new sub-process, if there is one
     */
    for (const node of nodes) {
      if (node.data.type !== "transition") {
        continue;
      }

      const previousTransition = persistedNet?.definition.nodes.find(
        (transition): transition is TransitionNodeType =>
          transition.data.type === "transition" && transition.id === node.id,
      );

      const previousSubProcessReference = previousTransition?.data.subProcess;

      const subProcessIdentityHasChanged =
        previousSubProcessReference?.subProcessEntityId !==
        node.data.subProcess?.subProcessEntityId;

      if (
        subProcessIdentityHasChanged &&
        previousSubProcessReference?.linkEntityId
      ) {
        /**
         * Archive the link to the previous sub-process.
         */
        await archiveEntity({
          variables: { entityId: previousSubProcessReference.linkEntityId },
        });

        const previousSubProcess = persistedNets.find(
          (net) =>
            net.entityId === previousSubProcessReference.subProcessEntityId,
        );

        if (!previousSubProcess) {
          throw new Error(
            `Sub-process ${previousSubProcessReference.subProcessEntityId} not found`,
          );
        }

        /**
         * Get the new nodes for the sub-process, with any links to parent places removed.
         */
        const updatedSubProcessNodes =
          updateSubProcessDefinitionForParentPlaces({
            subProcessNet: previousSubProcess,
            inputPlaceLabelById: {},
            outputPlaceLabelById: {},
          });

        if (updatedSubProcessNodes) {
          await updateEntity({
            variables: {
              entityUpdate: {
                entityId: previousSubProcess.entityId,
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
                        ...previousSubProcess.definition,
                        nodes: updatedSubProcessNodes,
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

      const { subProcessEntityId } = node.data.subProcess ?? {};

      const subProcessDefinition = persistedNets.find(
        (net) => net.entityId === subProcessEntityId,
      );

      if (subProcessEntityId && !subProcessDefinition) {
        throw new Error(`Sub-process ${subProcessEntityId} not found`);
      }

      if (
        subProcessIdentityHasChanged &&
        subProcessEntityId &&
        node.data.subProcess
      ) {
        /**
         * Create the link from the sub-process to the parent process.
         */
        await createEntity({
          variables: {
            entityTypeIds: [
              systemLinkEntityTypes.subProcessOf.linkEntityTypeId,
            ],
            linkData: {
              leftEntityId: subProcessEntityId,
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
                  value: node.data.subProcess.inputPlaceIds.map((id) => ({
                    metadata: {
                      dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                    },
                    value: id,
                  })),
                },
                "https://hash.ai/@h/types/property-type/output-place-id/": {
                  value: node.data.subProcess.outputPlaceIds.map((id) => ({
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

      if (!node.data.subProcess || !subProcessDefinition) {
        /**
         * If there is no linked sub-process now, we are done for this transition node.
         */
        continue;
      }

      /**
       * If there is a linked sub-process, we need to check if the selected input or output places for the parent transition node have changed,
       * so that we can make sure they are represented in the sub-process.
       */

      const subProcessInputPlaceIdsChanged = !areSetsEquivalent(
        new Set<string>(node.data.subProcess.inputPlaceIds),
        new Set<string>(
          previousTransition?.data.subProcess?.inputPlaceIds ?? [],
        ),
      );

      const subProcessOutputPlaceIdsChanged = !areSetsEquivalent(
        new Set<string>(node.data.subProcess.outputPlaceIds),
        new Set<string>(
          previousTransition?.data.subProcess?.outputPlaceIds ?? [],
        ),
      );

      if (subProcessInputPlaceIdsChanged || subProcessOutputPlaceIdsChanged) {
        const existingLink = previousTransition?.data.subProcess?.linkEntityId;

        if (existingLink) {
          /**
           * We need to update the existing link entity to represent the new input and output places.
           */
          const propertyPatches: PropertyPatchOperation[] = [];

          if (subProcessInputPlaceIdsChanged) {
            propertyPatches.push({
              op: "replace",
              path: [systemPropertyTypes.inputPlaceId.propertyTypeBaseUrl],
              property: {
                value: node.data.subProcess.inputPlaceIds.map((id) => ({
                  metadata: {
                    dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                  },
                  value: id,
                })),
              },
            });
          }

          if (subProcessOutputPlaceIdsChanged) {
            propertyPatches.push({
              op: "replace",
              path: [systemPropertyTypes.outputPlaceId.propertyTypeBaseUrl],
              property: {
                value: node.data.subProcess.outputPlaceIds.map((id) => ({
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
                entityId: existingLink,
                propertyPatches,
              },
            },
          });
        }

        const inputPlaceLabelById: Record<string, string> = {};
        const outputPlaceLabelById: Record<string, string> = {};

        for (const placeId of node.data.subProcess.inputPlaceIds) {
          const label = placeLabelsById[placeId];

          if (!label) {
            throw new Error(`Place ${placeId} not found when looking up label`);
          }

          inputPlaceLabelById[placeId] = label;
        }

        for (const placeId of node.data.subProcess.outputPlaceIds) {
          const label = placeLabelsById[placeId];

          if (!label) {
            throw new Error(`Place ${placeId} not found when looking up label`);
          }

          outputPlaceLabelById[placeId] = label;
        }

        const newNodes = updateSubProcessDefinitionForParentPlaces({
          subProcessNet: subProcessDefinition,
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
              entityId: subProcessDefinition.entityId,
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
                      ...subProcessDefinition.definition,
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
    setEntityId(persistedEntityId);
    setUserEditable(true);

    setPersistPending(false);
  }, [
    activeWorkspaceWebId,
    archiveEntity,
    arcs,
    createEntity,
    entityId,
    nodes,
    persistedNet?.definition.nodes,
    persistedNets,
    refetchPersistedNets,
    title,
    tokenTypes,
    updateEntity,
  ]);

  const discardChanges = useMemo(() => {
    if (!persistedNet) {
      return null;
    }

    return () => loadPersistedNet(persistedNet);
  }, [persistedNet, loadPersistedNet]);

  const value: EditorContextValue = useMemo(
    () => ({
      arcs,
      discardChanges,
      entityId,
      isDirty,
      nodes,
      parentProcess,
      persistedNets,
      persistPending,
      persistToGraph,
      refetchPersistedNets,
      setArcs,
      setEntityId,
      setNodes,
      setParentProcess,
      setPetriNetDefinition,
      setTitle,
      setTokenTypes,
      setUserEditable,
      switchToNet,
      title,
      tokenTypes,
      userEditable,
    }),
    [
      arcs,
      discardChanges,
      entityId,
      isDirty,
      nodes,
      parentProcess,
      persistPending,
      persistedNets,
      persistToGraph,
      refetchPersistedNets,
      setArcs,
      setEntityId,
      setNodes,
      setParentProcess,
      setPetriNetDefinition,
      setTitle,
      setTokenTypes,
      setUserEditable,
      switchToNet,
      title,
      tokenTypes,
      userEditable,
    ],
  );

  return (
    <EditorContext.Provider value={value}>
      {children}
      {switchTargetPendingConfirmation && (
        <AlertModal
          callback={() => {
            loadPersistedNet(switchTargetPendingConfirmation);
          }}
          calloutMessage="You have unsaved changes which will be discarded. Are you sure you want to switch to another net?"
          confirmButtonText="Switch"
          contentStyle={{
            maxWidth: 450,
          }}
          header="Switch and discard changes?"
          open
          close={() => setSwitchTargetPendingConfirmation(null)}
          type="warning"
        />
      )}
    </EditorContext.Provider>
  );
};

export const useEditorContext = () => {
  const context = useContext(EditorContext);

  if (!context) {
    throw new Error(
      "useEditorContext must be used within an EditorContextProvider",
    );
  }

  return context;
};
