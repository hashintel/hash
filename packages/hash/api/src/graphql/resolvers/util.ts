import { ImpureGraphContext } from "../../graph";
import { GraphQLContext } from "../context";

export const dataSourceToImpureGraphContext = ({
  graphApi,
  uploadProvider,
}: GraphQLContext["dataSources"]): ImpureGraphContext => {
  return {
    graphApi,
    uploadProvider,
  };
};
