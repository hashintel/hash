import { GraphQLError } from "graphql";

export const queryGraphQlApi = <
  ReturnData,
  Variables extends Record<string, unknown>,
>(
  query: string,
  variables?: Variables,
): Promise<{ data: ReturnData }> =>
  fetch(`${API_ORIGIN}/graphql`, {
    method: "POST",
    body: JSON.stringify({
      query,
      variables,
    }),
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
  })
    .then((resp) => resp.json())
    .then((resp: { data?: ReturnData; errors?: GraphQLError[] }) => {
      if (resp.errors ?? !resp.data) {
        throw new Error(
          resp.errors?.[0].message ?? "No data and no errors returned",
        );
      }

      return { data: resp.data };
    });
