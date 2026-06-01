import { useMutation } from "@apollo/client";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";

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

/**
 * Result of {@link persistDefinition}. The caller (the bridge layer in
 * `process-editor.tsx`) needs both the new entity id and the freshly-saved
 * snapshot to ack the iframe's pending save request, so we return both.
 */
export type PersistResult = {
  entityId: EntityId;
  /**
   * Decision-time recorded for the just-saved revision, sourced from the
   * refetched persisted-nets list.
   */
  decisionTime: string;
  userEditable: boolean;
};

type UseProcessSaveAndLoadParams = {
  selectedNetId: EntityId | null;
  setSelectedNetId: Dispatch<SetStateAction<EntityId | null>>;
  refetchRevisions: () => Promise<unknown>;
};

/**
 * Encapsulates the GraphQL persistence + persisted-nets-list reads needed by
 * the process editor host. The iframe owns the live SDCPN and title; the
 * host calls {@link persistDefinition} when forwarding a `requestSave` from
 * the bridge.
 */
export const useProcessSaveAndLoad = ({
  selectedNetId,
  setSelectedNetId,
  refetchRevisions,
}: UseProcessSaveAndLoadParams): {
  loadPersistedNet: (net: PersistedNet) => void;
  persistedNets: PersistedNet[];
  persistedNetsLoading: boolean;
  /**
   * Persist the supplied SDCPN + title to the graph. On success resolves
   * with the persisted entity id, the new decision-time, and whether the
   * resulting entity is editable by the current user. The caller is
   * responsible for any URL navigation following a create.
   */
  persistDefinition: (petriNet: SDCPN, title: string) => Promise<PersistResult>;
  setUserEditable: Dispatch<SetStateAction<boolean>>;
  userEditable: boolean;
} => {
  const {
    persistedNets,
    loading: persistedNetsLoading,
    refetch,
  } = usePersistedNets();

  const { activeWorkspaceWebId } = useActiveWorkspace();

  const [userEditable, setUserEditable] = useState(true);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const loadPersistedNet = useCallback(
    (net: PersistedNet) => {
      setSelectedNetId(net.entityId);
      setUserEditable(net.userEditable);
    },
    [setSelectedNetId, setUserEditable],
  );

  const refetchPersistedNets = useCallback(
    async ({
      updatedEntityId,
    }: {
      updatedEntityId: EntityId | null;
    }): Promise<{
      decisionTime: string;
      userEditable: boolean;
    } | null> => {
      const [updatedNetsData] = await Promise.all([
        refetch(),
        // For updates `selectedNetId` is unchanged, so Apollo won't
        // auto-refire the history query — kick it explicitly. For creates
        // it's a benign duplicate (Apollo deduplicates by variables).
        refetchRevisions(),
      ]);

      /**
       * Apollo's `refetch()` can resolve without `data` (e.g. some network
       * error paths) even though generated types model it as present.
       * Treat this as a soft failure so callers can surface a regular
       * save/refetch error instead of throwing on undefined access.
       */
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!updatedNetsData.data) {
        return null;
      }

      const transformedNets = getPersistedNetsFromSubgraph(
        updatedNetsData.data,
      );

      if (!updatedEntityId) {
        return null;
      }

      const updatedNet = transformedNets.find(
        (net) => net.entityId === updatedEntityId,
      );

      if (!updatedNet) {
        return null;
      }

      setSelectedNetId(updatedNet.entityId);
      setUserEditable(updatedNet.userEditable);
      return {
        decisionTime: updatedNet.lastUpdated,
        userEditable: updatedNet.userEditable,
      };
    },
    [refetch, refetchRevisions, setSelectedNetId, setUserEditable],
  );

  const persistDefinition = useCallback(
    async (petriNet: SDCPN, title: string): Promise<PersistResult> => {
      if (!activeWorkspaceWebId) {
        throw new Error("No active workspace; cannot persist Petri net.");
      }

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

      const refetched = await refetchPersistedNets({
        updatedEntityId: persistedEntityId,
      });

      if (!refetched) {
        throw new Error(
          "Persist appeared to succeed but the entity wasn't visible on refetch.",
        );
      }

      return {
        entityId: persistedEntityId,
        decisionTime: refetched.decisionTime,
        userEditable: refetched.userEditable,
      };
    },
    [
      activeWorkspaceWebId,
      createEntity,
      refetchPersistedNets,
      selectedNetId,
      updateEntity,
    ],
  );

  return useMemo(
    () => ({
      loadPersistedNet,
      persistedNets,
      persistedNetsLoading,
      persistDefinition,
      setUserEditable,
      userEditable,
    }),
    [
      loadPersistedNet,
      persistDefinition,
      persistedNets,
      persistedNetsLoading,
      setUserEditable,
      userEditable,
    ],
  );
};
