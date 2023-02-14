import { createApolloClient } from "@local/hash-graphql-shared/graphql/create-apollo-client";

import { isBrowser } from "./config";

export const apolloClient = createApolloClient({ isBrowser });
