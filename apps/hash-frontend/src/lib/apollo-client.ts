import { createApolloClient } from "@local/hash-isomorphic-utils/create-apollo-client";

import { isBrowser } from "./config";

export const apolloClient = createApolloClient({ isBrowser });
