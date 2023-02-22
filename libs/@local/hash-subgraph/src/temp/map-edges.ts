import { validateBaseUri } from "@blockprotocol/type-system";
import {
  Edges as EdgesGraphApi,
  KnowledgeGraphOutwardEdge as KnowledgeGraphOutwardEdgeGraphApi,
  OntologyOutwardEdge as OntologyOutwardEdgeGraphApi,
} from "@local/hash-graph-client";

import {
  BaseUri,
  Edges,
  EntityId,
  isEntityId,
  isKnowledgeGraphOutwardEdge,
  isOntologyOutwardEdge,
  OntologyTypeRevisionId,
  OutwardEdge,
  Timestamp,
} from "../types";

export const mapOutwardEdge = (
  outwardEdge: OntologyOutwardEdgeGraphApi | KnowledgeGraphOutwardEdgeGraphApi,
): OutwardEdge => {
  switch (outwardEdge.kind) {
    // Ontology edge-kind cases
    case "CONSTRAINS_PROPERTIES_ON":
    case "CONSTRAINS_LINKS_ON":
    case "CONSTRAINS_LINK_DESTINATIONS_ON":
    case "INHERITS_FROM":
    case "CONSTRAINS_VALUES_ON": {
      return {
        ...outwardEdge,
        rightEndpoint: {
          baseId: outwardEdge.rightEndpoint.baseId as BaseUri,
          revisionId:
            `${outwardEdge.rightEndpoint.revisionId}` as OntologyTypeRevisionId,
        },
      };
    }
    // Knowledge-graph edge-kind cases
    case "HAS_LEFT_ENTITY":
    case "HAS_RIGHT_ENTITY": {
      return {
        ...outwardEdge,
        rightEndpoint: {
          entityId: outwardEdge.rightEndpoint.baseId as EntityId,
          interval: {
            start: {
              kind: "inclusive",
              limit: outwardEdge.rightEndpoint.timestamp as Timestamp,
            },
            end: {
              /** @todo-0.3 - This is incorrect, this will be fixed when the graph backend is migrated to be consistent */
              kind: "unbounded",
            },
          },
        },
      };
    }
    // Shared edge-kind cases
    case "IS_OF_TYPE": {
      return outwardEdge.reversed
        ? {
            ...outwardEdge,
            reversed: outwardEdge.reversed,
            rightEndpoint: {
              entityId: outwardEdge.rightEndpoint.baseId as EntityId,
              interval: {
                start: {
                  kind: "inclusive",
                  limit: outwardEdge.rightEndpoint.revisionId as Timestamp,
                },
                end: {
                  /** @todo-0.3 - This is incorrect, this will be fixed when the graph backend is migrated to be consistent */
                  kind: "unbounded",
                },
              },
            },
          }
        : {
            ...outwardEdge,
            reversed: outwardEdge.reversed,
            rightEndpoint: {
              baseId: outwardEdge.rightEndpoint.baseId as BaseUri,
              revisionId:
                `${outwardEdge.rightEndpoint.revisionId}` as OntologyTypeRevisionId,
            },
          };
    }
  }
};

export const mapEdges = (edges: EdgesGraphApi): Edges => {
  const mappedEdges: Edges = {};

  // Trying to build this with `Object.fromEntries` breaks tsc and leads to `any` typed values
  for (const [baseId, inner] of Object.entries(edges)) {
    const result = validateBaseUri(baseId);
    if (result.type === "Ok") {
      // ------------ Ontology Type case ----------------
      const baseUri = result.inner as BaseUri;

      mappedEdges[baseUri] = Object.fromEntries(
        Object.entries(inner).map(([version, outwardEdges]) => {
          const versionNumber = Number(version);

          if (Number.isNaN(versionNumber)) {
            throw new Error(
              `Unrecognized ontology type version, expected a number but got: ${version}`,
            );
          }

          const mappedOutwardEdges = outwardEdges.map((outwardEdge) => {
            const mappedOutwardEdge = mapOutwardEdge(outwardEdge);
            if (isKnowledgeGraphOutwardEdge(mappedOutwardEdge)) {
              throw new Error(
                `Expected an ontology outward edge but found:\n${JSON.stringify(
                  outwardEdge,
                )}`,
              );
            }
            return mappedOutwardEdge;
          });

          return [versionNumber, mappedOutwardEdges];
        }),
      );
    } else if (isEntityId(baseId)) {
      // ------------ Entity (knowledge-graph) case ----------------
      mappedEdges[baseId] = Object.fromEntries(
        Object.entries(inner).map(([version, outwardEdges]) => {
          const timestamp = Date.parse(version);

          if (Number.isNaN(timestamp)) {
            throw new Error(
              `Unrecognized timestamp, expected an ISO-formatted timestamp but got: ${version}`,
            );
          }

          const mappedOutwardEdges = outwardEdges.map((outwardEdge) => {
            const mappedOutwardEdge = mapOutwardEdge(outwardEdge);
            if (isOntologyOutwardEdge(mappedOutwardEdge)) {
              throw new Error(
                `Expected an ontology outward edge but found:\n${JSON.stringify(
                  outwardEdge,
                )}`,
              );
            }
            return mappedOutwardEdge;
          });

          return [version, mappedOutwardEdges];
        }),
      );
    } else {
      throw new Error(
        `Unrecognized or invalid vertices outer key type: ${baseId}`,
      );
    }
  }

  return mappedEdges;
};
