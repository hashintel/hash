import { useMutation } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  blockProtocolDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import { useReactFlow } from "reactflow";
import { useLocalstorageState } from "rooks";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  createEntityMutation,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { useActiveWorkspace } from "../../shared/workspace-context";
import { usePersistedNets } from "./editor-context/use-persisted-nets";
import { defaultTokenTypes } from "./token-types";
import type {
  ArcType,
  NodeType,
  PersistedNet,
  PetriNetDefinitionObject,
  TokenType,
} from "./types";

type EditorContextValue = {
  arcs: ArcType[];
  entityId: EntityId | null;
  loadPersistedNet: (persistedNet: PersistedNet) => void;
  nodes: NodeType[];
  parentProcess: { entityId: EntityId; title: string } | null;
  persistedNets: PersistedNet[];
  persistToGraph: () => void;
  refetchPersistedNets: () => void;
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
  const [entityId, setEntityId] = useLocalstorageState<EntityId | null>(
    "petri-net-entity-id",
    null,
  );

  const [userEditable, setUserEditable] = useLocalstorageState<boolean>(
    "petri-net-user-editable",
    true,
  );

  const [nodes, setNodes] = useLocalstorageState<NodeType[]>(
    "petri-net-nodes",
    [],
  );

  const [arcs, setArcs] = useLocalstorageState<ArcType[]>("petri-net-arcs", []);

  const [tokenTypes, setTokenTypes] = useLocalstorageState<TokenType[]>(
    "petri-net-token-types",
    defaultTokenTypes,
  );

  const [title, setTitle] = useLocalstorageState<string>(
    "petri-net-title",
    "Process",
  );

  const [parentProcess, setParentProcess] = useLocalstorageState<{
    entityId: EntityId;
    title: string;
  } | null>("petri-net-parent-process", null);

  const { persistedNets, refetch: refetchPersistedNets } = usePersistedNets();

  const { activeWorkspaceWebId } = useActiveWorkspace();

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const persistToGraph = useCallback(async () => {
    if (!activeWorkspaceWebId) {
      return;
    }

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
                  value: JSON.stringify({
                    arcs,
                    nodes,
                    tokenTypes,
                  } satisfies PetriNetDefinitionObject),
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

      void refetchPersistedNets();
    } else {
      const createdEntityData = await createEntity({
        variables: {
          entityTypeIds: [systemEntityTypes.petriNet.entityTypeId],
          webId: activeWorkspaceWebId,
          properties: {
            // @ts-expect-error -- incompatibility between JsonValue and some of the Edge types
            // @todo fix this
            value: {
              [systemPropertyTypes.definitionObject.propertyTypeBaseUrl]: {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.object.dataTypeId,
                },
                value: {
                  arcs,
                  nodes,
                  tokenTypes,
                } satisfies PetriNetDefinitionObject,
              },
              [systemPropertyTypes.title.propertyTypeBaseUrl]: {
                metadata: {
                  dataTypeId: blockProtocolDataTypes.text.dataTypeId,
                },
                value: title,
              },
            },
          },
        },
      });

      if (!createdEntityData.data?.createEntity) {
        throw new Error("Failed to create petri net");
      }

      const createdEntity = new HashEntity(createdEntityData.data.createEntity);

      void refetchPersistedNets();

      setEntityId(createdEntity.entityId);
      setUserEditable(true);
    }
  }, [
    activeWorkspaceWebId,
    arcs,
    createEntity,
    entityId,
    nodes,
    refetchPersistedNets,
    setEntityId,
    setUserEditable,
    title,
    tokenTypes,
    updateEntity,
  ]);

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
          setTokenTypes(newTokenTypes);
        });

        setTokenTypes(newTokenTypes);

        setTimeout(() => {
          fitView({ duration: 200, padding: 0.03, maxZoom: 1 });
        }, 100);
      },
      [fitView, setArcs, setNodes, setTokenTypes],
    );

  const loadPersistedNet = useCallback(
    (persistedNet: PersistedNet) => {
      setEntityId(persistedNet.entityId);
      setParentProcess(persistedNet.parentProcess);
      setPetriNetDefinition(persistedNet.definition);
      setTitle(persistedNet.title);
      setUserEditable(persistedNet.userEditable);
    },
    [
      setEntityId,
      setParentProcess,
      setPetriNetDefinition,
      setTitle,
      setUserEditable,
    ],
  );

  const value: EditorContextValue = useMemo(
    () => ({
      arcs,
      entityId,
      loadPersistedNet,
      nodes,
      parentProcess,
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
      title,
      tokenTypes,
      userEditable,
    }),
    [
      arcs,
      entityId,
      loadPersistedNet,
      nodes,
      parentProcess,
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
      title,
      tokenTypes,
      userEditable,
    ],
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
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
