import { VersionedUri } from "@blockprotocol/type-system";
import {
  EntityId,
  EntityRevisionId,
  EntityRootType,
  EntityVertexId,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";

export const useDraftEntitySubgraph = (
  entityTypeId: VersionedUri,
): [
  Subgraph<EntityRootType> | undefined,
  Dispatch<SetStateAction<Subgraph<EntityRootType> | undefined>>,
  boolean,
] => {
  const [loading, setLoading] = useState(false);
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<EntityRootType>>();

  const { getEntityType } = useBlockProtocolGetEntityType();

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);

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
          baseId: "draft%draft" as EntityId,
          revisionId: now as EntityRevisionId,
        };

        setDraftEntitySubgraph({
          ...subgraph,
          roots: [draftEntityVertexId],
          vertices: {
            ...subgraph.vertices,
            [draftEntityVertexId.baseId]: {
              [draftEntityVertexId.revisionId]: {
                kind: "entity",
                inner: {
                  properties: {},
                  metadata: {
                    recordId: {
                      entityId: draftEntityVertexId.baseId,
                      editionId: now,
                    },
                    entityTypeId,
                    provenance: { updatedById: "" },
                    archived: false,
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
                  },
                },
              },
            },
          },
        } as Subgraph<EntityRootType>);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [entityTypeId, getEntityType]);

  return [draftEntitySubgraph, setDraftEntitySubgraph, loading];
};
