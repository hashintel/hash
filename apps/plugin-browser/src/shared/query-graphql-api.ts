import { queryGraphQlApi as queryApi } from "@local/hash-isomorphic-utils/query-graphql-api";

import { getFromLocalStorage } from "./storage";

export const queryGraphQlApi = async <
  ReturnData,
  Variables extends Record<string, unknown>,
>(
  query: string,
  variables?: Variables,
): Promise<{ data: ReturnData }> => {
  const apiOrigin = (await getFromLocalStorage("apiOrigin")) ?? API_ORIGIN;

  return queryApi({ client: "browser-extension", query, variables, apiOrigin });
};
