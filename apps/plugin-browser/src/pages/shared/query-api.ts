export const queryApi = (query: string, variables?: Record<string, unknown>) =>
  fetch("https://app-api.hash.ai/graphql", {
    method: "POST",
    body: JSON.stringify({
      query,
      variables,
    }),
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
  }).then((resp) => resp.json());
