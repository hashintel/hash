import type { ImpureGraphContext } from "../../graph/context-types";
import type { GraphQLContext } from "../context";

export const graphQLContextToImpureGraphContext = ({
  dataSources,
  provenance,
  temporal,
}: GraphQLContext): ImpureGraphContext<true, true> => {
  const { graphApi, uploadProvider } = dataSources;

  return {
    graphApi,
    provenance,
    uploadProvider,
    temporalClient: temporal,
  };
};
