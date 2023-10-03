import { GraphQLError } from "graphql";

export const queryApi = (query: string, variables?: Record<string, unknown>) =>
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
      return { data: resp.data };
    });
