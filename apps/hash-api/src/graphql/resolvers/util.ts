import { ImpureGraphContext } from "../../graph";
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
