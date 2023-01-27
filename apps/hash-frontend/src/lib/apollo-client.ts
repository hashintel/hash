import { createApolloClient } from "@local/hash-isomorphic-utils/graphql/create-apollo-client";

import { isBrowser } from "./config";

export const apolloClient = createApolloClient({ isBrowser });
