import { EntityEditionId, Subgraph } from "@hashintel/subgraph/src/types";
import { merge } from "lodash";

export const mergeSubgraphs = (subgraphs: Subgraph[]): Subgraph => {
  return subgraphs.reduce((accumulate, next) => {
    return merge(accumulate, next);
  });
};
