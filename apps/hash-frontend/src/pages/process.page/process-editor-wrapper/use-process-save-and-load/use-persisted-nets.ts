import { useQuery } from "@apollo/client";
import {
  getIncomingLinkAndSourceEntities,
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { Entity, LinkEntity } from "@blockprotocol/type-system";
import type {
  PetriNetDefinitionObject,
  TransitionNodeData,
} from "@hashintel/petrinaut-old";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
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
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import type { PersistedNet } from "../use-process-save-and-load";

export const getPersistedNetsFromSubgraph = (
  data: QueryEntitySubgraphQuery,
): PersistedNet[] => {
  const subgraph = deserializeQueryEntitySubgraphResponse<PetriNet>(
    data.queryEntitySubgraph,
  ).subgraph;

  const nets = getRoots(subgraph);

  const childNetLinksByNodeIdAndChildNetId: PersistedNet["childNetLinksByNodeIdAndChildNetId"] =
    {};

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
      TransitionNodeData["childNet"]
    >();

    for (const incomingSubProcess of incomingSubProcesses) {
      const subProcessOfLink = incomingSubProcess.linkEntity[0];
      const subProcess = incomingSubProcess.leftEntity[0];

      if (!subProcessOfLink || !subProcess) {
        continue;
      }

      childNetLinksByNodeIdAndChildNetId[
        subProcessOfLink.properties[
          "https://hash.ai/@h/types/property-type/transition-id/"
        ]
      ] = {
        [subProcess.entityId]: {
          linkEntityId: subProcessOfLink.entityId,
        },
      };

      transitionIdToSubprocess.set(
        subProcessOfLink.properties[
          "https://hash.ai/@h/types/property-type/transition-id/"
        ],
        {
          childNetTitle:
            subProcess.properties[
              "https://hash.ai/@h/types/property-type/title/"
            ],
          childNetId: subProcess.entityId,
          inputPlaceIds:
            subProcessOfLink.properties[
              "https://hash.ai/@h/types/property-type/input-place-id/"
            ],
          outputPlaceIds:
            subProcessOfLink.properties[
              "https://hash.ai/@h/types/property-type/output-place-id/"
            ],
        },
      );
    }

    const clonedNodes = JSON.parse(JSON.stringify(definition.nodes));

    const clonedDefinition = {
      ...definition,
      nodes: clonedNodes,
    };

    for (const node of clonedDefinition.nodes) {
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
      !!data.queryEntitySubgraph.entityPermissions?.[net.entityId]?.update;

    return {
      entityId: net.entityId,
      title: netTitle,
      definition: clonedDefinition,
      parentNet: parentProcess
        ? {
            parentNetId: parentProcess.entityId,
            title:
              parentProcess.properties[
                "https://hash.ai/@h/types/property-type/title/"
              ],
          }
        : null,
      childNetLinksByNodeIdAndChildNetId,
      userEditable,
    };
  });
};

export const usePersistedNets = () => {
  const { data, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
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
        traversalPaths: [
          {
            edges: [
              { kind: "has-left-entity", direction: "incoming" },
              { kind: "has-right-entity", direction: "outgoing" },
            ],
          },
          {
            edges: [
              { kind: "has-right-entity", direction: "incoming" },
              { kind: "has-left-entity", direction: "outgoing" },
            ],
          },
        ],
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
        includePermissions: true,
      },
    },
  });

  const persistedNets = useMemo(() => {
    if (!data) {
      return [];
    }

    return getPersistedNetsFromSubgraph(data);
  }, [data]);

  return {
    persistedNets,
    refetch,
  };
};
