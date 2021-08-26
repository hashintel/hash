import { ApolloQueryResult } from "@apollo/client";
import React from "react";
import { MeQuery } from "../../graphql/apiTypes.gen";

type UserContextProps = {
  user: MeQuery["me"] | undefined;
  refetch: () => Promise<ApolloQueryResult<MeQuery>>;
  loading: boolean;
};

export const UserContext = React.createContext<UserContextProps>({
  user: undefined,
  refetch: () => {
    throw new Error("Cannot refetch user outside of UserContext Provider");
  },
  loading: false,
});

