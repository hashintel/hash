import type { Dispatch, SetStateAction , useEffect, useState } from "react";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity as GraphApiEntity } from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import type {
  EntityRevisionId,
  EntityRootType,
  EntityVertexId,
 extractOwnedByIdFromEntityId,  Subgraph } from "@local/hash-subgraph";

import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";

export const useDraftEntitySubgraph = (
  entityTypeId: VersionedUrl,
): [
  Subgraph<EntityRootType> | undefined,
  Dispatch<SetStateAction<Subgraph<EntityRootType> | undefined>>,
  boolean,
] => {
  const [loading, setLoading] = useState(true);
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<EntityRootType>>();

  const { getEntityType } = useBlockProtocolGetEntityType();

  useEffect(() => {
    const init = async () => {
      try {
        const { data: subgraph } = await getEntityType({
          data: {
            entityTypeId,
            graphResolveDepths: {
              constrainsValuesOn: { outgoing: 255 },
              constrainsLinksOn: { outgoing: 255 },
              constrainsLinkDestinationsOn: { outgoing: 255 },
              constrainsPropertiesOn: { outgoing: 255 },
            },
          },
        });

        if (!subgraph) {
          throw new Error("subgraph not found");
        }

        const now = new Date().toISOString() as Timestamp;

        const draftEntityVertexId: EntityVertexId = {
          baseId: "draft~draft" as EntityId,
          revisionId: now as EntityRevisionId,
        };
        const creator = extractOwnedByIdFromEntityId(
          draftEntityVertexId.baseId,
        );

        setDraftEntitySubgraph({
          ...subgraph,
          roots: [draftEntityVertexId],
          vertices: {
            ...subgraph.vertices,
            [draftEntityVertexId.baseId]: {
              [draftEntityVertexId.revisionId]: {
                kind: "entity",
                inner: new Entity({
                  properties: {},
                  metadata: {
                    recordId: {
                      entityId: draftEntityVertexId.baseId,
                      editionId: now,
                    },
                    entityTypeIds: [entityTypeId],
                    temporalVersioning: {
                      decisionTime: {
                        start: {
                          kind: "inclusive",
                          limit: now,
                        },
                        end: {
                          kind: "unbounded",
                        },
                      },
                      transactionTime: {
                        start: {
                          kind: "inclusive",
                          limit: now,
                        },
                        end: {
                          kind: "unbounded",
                        },
                      },
                    },
                    archived: false,
                    provenance: {
                      createdAtDecisionTime: now,
                      createdAtTransactionTime: now,
                      createdById: creator,
                      edition: {
                        createdById: creator,
                      },
                    },
                  },
                } satisfies GraphApiEntity),
              },
            },
          },
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [entityTypeId, getEntityType]);

  return [draftEntitySubgraph, setDraftEntitySubgraph, loading];
};
