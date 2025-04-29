import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import {
  getIncomingLinkAndSourceEntities,
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { Entity, EntityId, LinkEntity } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  PetriNet,
  SubProcessOf,
} from "@local/hash-isomorphic-utils/system-types/petrinet";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import type { PersistedNet, PetriNetDefinitionObject } from "../types";

const getPersistedNets = (data: GetEntitySubgraphQuery): PersistedNet[] => {
  const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
    EntityRootType<HashEntity<PetriNet>>
  >(data.getEntitySubgraph.subgraph);

  const nets = getRoots(subgraph);

  return nets.map((net) => {
    const netTitle =
      net.properties["https://hash.ai/@h/types/property-type/title/"];

    const definition = net.properties[
      "https://hash.ai/@h/types/property-type/definition-object/"
    ] as PetriNetDefinitionObject;

    const incomingSubProcesses = getIncomingLinkAndSourceEntities(
      subgraph,
      net.entityId,
    ).filter(
      (
        linkAndLeftEntity,
      ): linkAndLeftEntity is {
        linkEntity: LinkEntity<SubProcessOf>[];
        leftEntity: Entity<PetriNet>[];
      } => {
        const linkEntity = linkAndLeftEntity.linkEntity[0];

        if (!linkEntity) {
          return false;
        }

        return linkEntity.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.subProcessOf.linkEntityTypeId,
        );
      },
    );

    const transitionIdToSubprocess = new Map<
      string,
      { title: string; entityId: EntityId }
    >();

    for (const incomingSubProcess of incomingSubProcesses) {
      const subProcessOfLink = incomingSubProcess.linkEntity[0];
      const subProcess = incomingSubProcess.leftEntity[0];

      if (!subProcessOfLink || !subProcess) {
        continue;
      }

      transitionIdToSubprocess.set(
        subProcessOfLink.properties[
          "https://hash.ai/@h/types/property-type/transition-id/"
        ],
        {
          title:
            subProcess.properties[
              "https://hash.ai/@h/types/property-type/title/"
            ],
          entityId: subProcess.entityId,
        },
      );
    }

    for (const node of definition.nodes) {
      if (node.data.type === "transition") {
        const subProcess = transitionIdToSubprocess.get(node.id);

        if (subProcess) {
          node.data.subProcess = subProcess;
        }
      }
    }

    const outgoingLinkAndRightEntities = getOutgoingLinkAndTargetEntities(
      subgraph,
      net.entityId,
    ).filter(
      (
        linkAndRightEntity,
      ): linkAndRightEntity is {
        linkEntity: LinkEntity<SubProcessOf>[];
        rightEntity: Entity<PetriNet>[];
      } => {
        const linkEntity = linkAndRightEntity.linkEntity[0];

        if (!linkEntity) {
          return false;
        }

        return linkEntity.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.subProcessOf.linkEntityTypeId,
        );
      },
    );

    const parentProcess = outgoingLinkAndRightEntities[0]?.rightEntity[0];

    const userEditable =
      !!data.getEntitySubgraph.userPermissionsOnEntities?.[net.entityId]?.edit;

    return {
      entityId: net.entityId,
      title: netTitle,
      definition,
      parentProcess: parentProcess
        ? {
            entityId: parentProcess.entityId,
            title:
              parentProcess.properties[
                "https://hash.ai/@h/types/property-type/title/"
              ],
          }
        : null,
      userEditable,
    };
  });
};

export const usePersistedNets = () => {
  const { data, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          equal: [
            {
              path: ["type", "versionedUrl"],
            },
            {
              parameter: systemEntityTypes.petriNet.entityTypeId,
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasRightEntity: {
            incoming: 1,
            outgoing: 1,
          },
          hasLeftEntity: {
            incoming: 1,
            outgoing: 1,
          },
        },
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
      includePermissions: true,
    },
  });

  const persistedNets = useMemo(() => {
    if (!data) {
      return [];
    }

    return getPersistedNets(data);
  }, [data]);

  return {
    persistedNets,
    refetch,
  };
};
