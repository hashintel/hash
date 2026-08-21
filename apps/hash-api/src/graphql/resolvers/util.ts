import type { ImpureGraphContext } from "../../graph/context-types";
import type { GraphQLContext } from "../context";

export const graphQLContextToImpureGraphContext = ({
  dataSources,
  emailTransporter,
  logger,
  provenance,
  temporal,
}: GraphQLContext): ImpureGraphContext<true, true> => {
  const { graphApi, uploadProvider } = dataSources;
  return {
    graphApi,
    emailTransporter,
    logger,
    provenance,
    uploadProvider,
    temporalClient: temporal,
  };
};
