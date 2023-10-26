import { ImpureGraphContext } from "../../graph/util";
import { GraphQLContext } from "../context";

export const dataSourcesToImpureGraphContext = ({
  graphApi,
  uploadProvider,
}: GraphQLContext["dataSources"]): ImpureGraphContext => {
  return {
    graphApi,
    uploadProvider,
  };
};
