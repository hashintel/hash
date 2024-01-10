import type { ImpureGraphContext } from "../../graph/context-types";
import type { GraphQLContext } from "../context";

export const dataSourcesToImpureGraphContext = ({
  graphApi,
  uploadProvider,
}: GraphQLContext["dataSources"]): ImpureGraphContext<true> => {
  return {
    graphApi,
    uploadProvider,
  };
};
