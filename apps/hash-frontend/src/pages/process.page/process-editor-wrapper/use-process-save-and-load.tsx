import { useMutation } from "@apollo/client";
import type {
  EntityId,
  PropertyObjectWithMetadata,
} from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  blockProtocolDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { PetriNetPropertiesWithMetadata } from "@local/hash-isomorphic-utils/system-types/petrinet";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";

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
import {
  convertSDCPNToPetriNetDefinitionObject,
  type PetriNetDefinitionObject,
} from "./convert-net-formats";
import {
  getPersistedNetsFromSubgraph,
  usePersistedNets,
} from "./use-process-save-and-load/use-persisted-nets";

export type PersistedNet = {
  entityId: EntityId;
  title: string;
  definition: SDCPN;
  userEditable: boolean;
};

type UseProcessSaveAndLoadParams = {
  petriNet: SDCPN;
  selectedNetId: EntityId | null;
  setPetriNet: Dispatch<SetStateAction<SDCPN>>;
  setSelectedNetId: Dispatch<SetStateAction<EntityId | null>>;
  setTitle: Dispatch<SetStateAction<string>>;
  title: string;
};

export const useProcessSaveAndLoad = ({
  petriNet,
  selectedNetId,
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

    if (petriNet.places.length !== persistedNet.definition.places.length) {
      return true;
    }

    if (
      petriNet.transitions.length !== persistedNet.definition.transitions.length
    ) {
      return true;
    }

    if (petriNet.types.length !== persistedNet.definition.types.length) {
      return true;
    }

    if (
      JSON.stringify(petriNet.places) !==
      JSON.stringify(persistedNet.definition.places)
    ) {
      return true;
    }

    if (
      JSON.stringify(petriNet.transitions) !==
      JSON.stringify(persistedNet.definition.transitions)
    ) {
      return true;
    }

    if (
      JSON.stringify(petriNet.types) !==
      JSON.stringify(persistedNet.definition.types)
    ) {
      return true;
    }

    if (
      JSON.stringify(petriNet.differentialEquations) !==
      JSON.stringify(persistedNet.definition.differentialEquations)
    ) {
      return true;
    }

    if (
      JSON.stringify(petriNet.parameters) !==
      JSON.stringify(persistedNet.definition.parameters)
    ) {
      return true;
    }

    return false;
  }, [petriNet, persistedNet, title]);

  const loadPersistedNet = useCallback(
    (net: PersistedNet) => {
      setSelectedNetId(net.entityId);
      setPetriNet(net.definition);
      setTitle(net.title);
      setUserEditable(net.userEditable);
    },
    [setPetriNet, setSelectedNetId, setTitle, setUserEditable],
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

    // Convert SDCPN to old format for persistence (backward compatibility)
    const oldFormatDefinition: PetriNetDefinitionObject =
      convertSDCPNToPetriNetDefinitionObject(petriNet);

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
                // @ts-expect-error -- PetriNetDefinitionObject not assignable to PropertyWithMetadata
                property: {
                  metadata: {
                    dataTypeId: blockProtocolDataTypes.object.dataTypeId,
                  },
                  value: oldFormatDefinition,
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
                value: oldFormatDefinition,
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

    await refetchPersistedNets({ updatedEntityId: persistedEntityId });
    setSelectedNetId(persistedEntityId);
    setUserEditable(true);

    setPersistPending(false);
  }, [
    activeWorkspaceWebId,
    createEntity,
    petriNet,
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
