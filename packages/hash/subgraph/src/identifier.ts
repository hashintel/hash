import { EntityEditionId, GraphElementEditionId } from "./types";

export const isEntityEditionId = (
  graphElementEditionId: GraphElementEditionId,
): graphElementEditionId is EntityEditionId => {
  return (
    typeof graphElementEditionId === "object" &&
    "entityIdentifier" in graphElementEditionId &&
    "version" in graphElementEditionId
  );
};
