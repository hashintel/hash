import { validateBaseUri } from "@blockprotocol/type-system";
import {
  Edges as EdgesGraphApi,
  KnowledgeGraphOutwardEdges,
  OntologyOutwardEdges,
} from "@local/hash-graph-client";

import {
  Edges,
  isEntityId,
  isEntityIdAndTimestamp,
  isKnowledgeGraphOutwardEdge,
  isOntologyOutwardEdge,
  isOntologyTypeRecordId,
  OutwardEdge,
} from "../../src";

export const mapOutwardEdge = (
  outwardEdge: OntologyOutwardEdges | KnowledgeGraphOutwardEdges,
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
          baseUri: outwardEdge.rightEndpoint.baseId,
          version: outwardEdge.rightEndpoint.version,
        },
      };
    }
    // Knowledge-graph edge-kind cases
    case "HAS_LEFT_ENTITY":
    case "HAS_RIGHT_ENTITY": {
      if (!isEntityIdAndTimestamp(outwardEdge.rightEndpoint)) {
        throw new Error(
          `Expected an \`EntityAndTimestamp\` for knowledge-graph edge-kind endpoint but found:\n${JSON.stringify(
            outwardEdge,
          )}`,
        );
      }
      return {
        ...outwardEdge,
        rightEndpoint: {
          baseId: outwardEdge.rightEndpoint.baseId,
          timestamp: outwardEdge.rightEndpoint.timestamp,
        },
      };
    }
    // Shared edge-kind cases
    case "IS_OF_TYPE": {
      if (!isOntologyTypeRecordId(outwardEdge.rightEndpoint)) {
        throw new Error(
          `Expected an \`OntologyTypeRecordId\` for knowledge-graph to ontology edge endpoint but found:\n${JSON.stringify(
            outwardEdge,
          )}`,
        );
      }
      return {
        ...outwardEdge,
        rightEndpoint: {
          baseUri: outwardEdge.rightEndpoint.baseId,
          version: outwardEdge.rightEndpoint.version,
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
      const baseUri = result.inner;

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
