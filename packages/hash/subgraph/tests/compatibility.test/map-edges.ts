import { Edges as EdgesGraphApi } from "@hashintel/hash-graph-client";
import { validateBaseUri } from "@blockprotocol/type-system-node";
import {
  Edges,
  isKnowledgeGraphOutwardEdge,
  isOntologyOutwardEdge,
} from "../../src";
import { isEntityId } from "./util";

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
            if (isKnowledgeGraphOutwardEdge(outwardEdge)) {
              throw new Error(
                `Expected an ontology outward edge but found:\n${JSON.stringify(
                  outwardEdge,
                )}`,
              );
            }
            return outwardEdge;
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
            if (isOntologyOutwardEdge(outwardEdge)) {
              throw new Error(
                `Expected an ontology outward edge but found:\n${JSON.stringify(
                  outwardEdge,
                )}`,
              );
            }
            return outwardEdge;
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
