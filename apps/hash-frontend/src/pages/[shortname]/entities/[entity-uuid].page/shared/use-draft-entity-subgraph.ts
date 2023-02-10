import { VersionedUri } from "@blockprotocol/type-system";
import {
  EntityId,
  EntityVertexId,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph/main";
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";

export const useDraftEntitySubgraph = (
  entityTypeId: VersionedUri,
): [
  Subgraph<SubgraphRootTypes["entity"]> | undefined,
  Dispatch<SetStateAction<Subgraph<SubgraphRootTypes["entity"]> | undefined>>,
  boolean,
] => {
  const [loading, setLoading] = useState(false);
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();

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

        const draftEntityVertexId: EntityVertexId = {
          baseId: "draft%draft" as EntityId,
          version: new Date().toISOString(),
        };

        setDraftEntitySubgraph({
          ...subgraph,
          roots: [draftEntityVertexId],
          vertices: {
            ...subgraph.vertices,
            [draftEntityVertexId.baseId]: {
              [draftEntityVertexId.version]: {
                kind: "entity",
                inner: {
                  properties: {},
                  metadata: {
                    recordId: {
                      entityId: draftEntityVertexId.baseId,
                      version: draftEntityVertexId.version,
                    },
                    entityTypeId,
                    provenance: { updatedById: "" },
                    archived: false,
                    version: {
                      decisionTime: { start: draftEntityVertexId.version },
                      transactionTime: { start: draftEntityVertexId.version },
                    },
                  },
                },
              },
            },
          },
        } as Subgraph<SubgraphRootTypes["entity"]>);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [entityTypeId, getEntityType]);

  return [draftEntitySubgraph, setDraftEntitySubgraph, loading];
};
