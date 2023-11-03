import { ImpureGraphContext } from "../../graph/util";
import { GraphQLContext } from "../context";

export const dataSourcesToImpureGraphContext = ({
  graphApi,
  uploadProvider,
}: GraphQLContext["dataSources"]): ImpureGraphContext<true> => {
  return {
    graphApi,
    uploadProvider,
  };
};
