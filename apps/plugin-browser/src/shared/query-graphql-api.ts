import { queryGraphQlApi as queryApi } from "@local/hash-isomorphic-utils/query-graphql-api";

export const queryGraphQlApi = <
  ReturnData,
  Variables extends Record<string, unknown>,
>(
  query: string,
  variables?: Variables,
): Promise<{ data: ReturnData }> =>
  queryApi({ query, variables, apiOrigin: API_ORIGIN });
