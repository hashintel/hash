import type { ImpureGraphContext } from "../../graph/context-types";
import type { GraphQLContext } from "../context";

export const graphQLContextToImpureGraphContext = ({
  dataSources,
  temporal,
}: GraphQLContext): ImpureGraphContext<true, true> => {
  const { graphApi, uploadProvider } = dataSources;
  return {
    graphApi,
    uploadProvider,
    temporalClient: temporal,
  };
};
