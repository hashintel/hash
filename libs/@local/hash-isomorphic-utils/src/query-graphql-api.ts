import type { GraphQLError } from "graphql/index.js";

import type { hashClientHeaderKey, HashClientType } from "./http-requests.js";

export const queryGraphQlApi = <
  ReturnData,
  Variables extends Record<string, unknown>,
>({
  query,
  variables,
  apiOrigin,
  client,
}: {
  query: string;
  variables?: Variables;
  apiOrigin: string;
  client: HashClientType;
}): Promise<{ data: ReturnData }> =>
  fetch(`${apiOrigin}/graphql`, {
    method: "POST",
    body: JSON.stringify({
      query,
      variables,
    }),
    headers: {
      "content-type": "application/json",
      [hashClientHeaderKey]: client,
    },
    credentials: "include",
  })
    .then((resp) => resp.json())
    .then((resp: { data?: ReturnData; errors?: GraphQLError[] }) => {
      if (resp.errors ?? !resp.data) {
        throw new Error(
          resp.errors?.[0]?.message ?? "No data and no errors returned",
        );
      }

      return { data: resp.data };
    });
