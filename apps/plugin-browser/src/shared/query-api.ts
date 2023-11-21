import { GraphQLError } from "graphql";

export const queryApi = <
  Query extends any,
  Variables extends Record<string, unknown>,
>(
  query: string,
  variables?: Variables,
): Promise<{ data: Query }> =>
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
    .then((resp: { data?: any; errors?: GraphQLError[] }) => {
      if (resp.errors || !resp.data) {
        throw new Error(
          resp.errors?.[0].message ?? "No data and no errors returned",
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      return { data: resp.data };
    });
