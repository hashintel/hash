import { useMutation } from "@apollo/client";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";

import { isSDCPNEqual } from "@hashintel/petrinaut";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  blockProtocolDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createEntityMutation,
  updateEntityMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
import {
  getPersistedNetsFromSubgraph,
  type PersistedNet,
  usePersistedNets,
} from "../../../processes.page/use-persisted-nets";
import { useActiveWorkspace } from "../../../shared/workspace-context";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import type {
  EntityId,
  PropertyObjectWithMetadata,
} from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";
import type { PetriNetPropertiesWithMetadata } from "@local/hash-isomorphic-utils/system-types/petrinet";

export type { PersistedNet } from "../../../processes.page/use-persisted-nets";

type UseProcessSaveAndLoadParams = {
  petriNet: SDCPN;
  selectedNetId: EntityId | null;
  /**
   * Replace the entire active net with a new SDCPN. Internally the consumer
   * recreates the document handle, which resets undo/redo history — so this
   * is intended for net-switch / load flows, not user mutations.
   */
  setPetriNet: (sdcpn: SDCPN) => void;
  setSelectedNetId: Dispatch<SetStateAction<EntityId | null>>;
  setLoadedRevisionTime: Dispatch<SetStateAction<string | null>>;
  setTitle: Dispatch<SetStateAction<string>>;
  title: string;
  refetchRevisions: () => Promise<unknown>;
};

export const useProcessSaveAndLoad = ({
  petriNet,
  selectedNetId,
  setSelectedNetId,
  setLoadedRevisionTime,
  setPetriNet,
  setTitle,
  title,
  refetchRevisions,
}: UseProcessSaveAndLoadParams): {
  isDirty: boolean;
  loadPersistedNet: (net: PersistedNet) => void;
  persistedNets: PersistedNet[];
  persistedNetsLoading: boolean;
  persistPending: boolean;
  /**
   * Persist the active net. On success, resolves with the entity id of the
   * persisted (created or updated) entity; the caller is responsible for any
   * URL navigation needed after a create.
   */
  persistToGraph: () => Promise<EntityId | null>;
  setUserEditable: Dispatch<SetStateAction<boolean>>;
  userEditable: boolean;
} => {
  const {
    persistedNets,
    loading: persistedNetsLoading,
    refetch,
  } = usePersistedNets();

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

    return (
      title !== persistedNet.title ||
      !isSDCPNEqual(petriNet, persistedNet.definition)
    );
  }, [petriNet, persistedNet, title]);

  const loadPersistedNet = useCallback(
    (net: PersistedNet) => {
      setSelectedNetId(net.entityId);
      setPetriNet(net.definition);
      setTitle(net.title);
      setUserEditable(net.userEditable);
      setLoadedRevisionTime(net.lastUpdated);
    },
    [
      setLoadedRevisionTime,
      setPetriNet,
      setSelectedNetId,
      setTitle,
      setUserEditable,
    ],
  );

  const refetchPersistedNets = useCallback(
    async ({ updatedEntityId }: { updatedEntityId: EntityId | null }) => {
      const [updatedNetsData] = await Promise.all([
        refetch(),
        // For updates `selectedNetId` is unchanged, so Apollo won't
        // auto-refire the history query — kick it explicitly. For creates
        // it's a benign duplicate (Apollo deduplicates by variables).
        refetchRevisions(),
      ]);

      // Apollo can resolve `refetch()` without `data` (e.g. when the
      // network errored), and `getPersistedNetsFromSubgraph` would throw
      // on the missing `queryEntitySubgraph`. The mutation has already
      // succeeded by this point, so swallow the local-cache update and
      // let `useQuery`'s normal polling/revalidation catch up. Apollo's
      // own types pretend `data` is always present, so the runtime guard
      // is needed even though TS thinks it's redundant.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!updatedNetsData.data) {
        return;
      }

      const transformedNets = getPersistedNetsFromSubgraph(
        updatedNetsData.data,
      );

      if (updatedEntityId) {
        const updatedNet = transformedNets.find(
          (net) => net.entityId === updatedEntityId,
        );

        if (updatedNet) {
          setSelectedNetId(updatedNet.entityId);
          setUserEditable(updatedNet.userEditable);
          setLoadedRevisionTime(updatedNet.lastUpdated);
        }
      }
    },
    [
      refetch,
      refetchRevisions,
      setLoadedRevisionTime,
      setSelectedNetId,
      setUserEditable,
    ],
  );

  const persistToGraph = useCallback(async (): Promise<EntityId | null> => {
    if (!activeWorkspaceWebId) {
      return null;
    }

    setPersistPending(true);

    try {
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
                    value: petriNet,
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
                  value: petriNet,
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

        const createdEntity = new HashEntity(
          createdEntityData.data.createEntity,
        );

        persistedEntityId = createdEntity.entityId;
      }

      if (!persistedEntityId) {
        throw new Error("Somehow no entityId available after persisting net");
      }

      await refetchPersistedNets({ updatedEntityId: persistedEntityId });
      setSelectedNetId(persistedEntityId);
      setUserEditable(true);

      return persistedEntityId;
    } finally {
      setPersistPending(false);
    }
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

  return useMemo(
    () => ({
      isDirty,
      loadPersistedNet,
      persistedNets,
      persistedNetsLoading,
      persistPending,
      persistToGraph,
      setUserEditable,
      userEditable,
    }),
    [
      isDirty,
      loadPersistedNet,
      persistPending,
      persistedNets,
      persistedNetsLoading,
      persistToGraph,
      setUserEditable,
      userEditable,
    ],
  );
};
