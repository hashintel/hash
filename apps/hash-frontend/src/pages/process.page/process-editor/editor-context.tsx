import { useMutation } from "@apollo/client";
import type {
  EntityId,
  PropertyObjectWithMetadata,
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
import type { nodes } from "jsonpath";
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
      JSON.stringify(
        nodes.map(({ selected: _, dragging: __, ...node }) => node),
      ) !== JSON.stringify(persistedNet.definition.nodes)
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
                    nodes,
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
                  nodes,
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
     * Handle sub-process changes. For any sub-process changed on a transition:
     * 1. Archive the previous sub-process, if there was one
     * 2. Create a new link to the new sub-process, if there is one
     */
    for (const node of nodes) {
      if (node.data.type === "transition") {
        const previousTransition = persistedNet?.definition.nodes.find(
          (transition): transition is TransitionNodeType =>
            transition.data.type === "transition" && transition.id === node.id,
        );

        const previousSubProcess = previousTransition?.data.subProcess;

        const subProcessHasChanged =
          previousSubProcess?.subProcessEntityId !==
          node.data.subProcess?.subProcessEntityId;

        if (!subProcessHasChanged) {
          continue;
        }

        if (previousSubProcess?.linkEntityId) {
          await archiveEntity({
            variables: { entityId: previousSubProcess.linkEntityId },
          });
        }

        if (node.data.subProcess?.subProcessEntityId) {
          await createEntity({
            variables: {
              entityTypeIds: [
                systemLinkEntityTypes.subProcessOf.linkEntityTypeId,
              ],
              linkData: {
                leftEntityId: node.data.subProcess.subProcessEntityId,
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
    refetchPersistedNets,
    setEntityId,
    setUserEditable,
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
