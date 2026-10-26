import { hashClientHeaderKey } from "./http-requests.js";

import type { HashClientType } from "./http-requests.js";
import type { GraphQLError } from "graphql/index.js";

interface GraphQlResponse<ReturnData> {
  data?: ReturnData;
  errors?: GraphQLError[];
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- callers specify the response shape of their query, which cannot be inferred from the arguments
export const queryGraphQlApi = async <ReturnData>({
  query,
  variables,
  apiOrigin,
  client,
}: {
  query: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- GraphQL variables are arbitrary JSON values, validated server-side
  variables?: Record<string, unknown>;
  apiOrigin: string;
  client: HashClientType;
}): Promise<{ data: ReturnData }> => {
  const response = await fetch(`${apiOrigin}/graphql`, {
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
  });

  // SAFETY: the shape of the response body is determined by the query, which the caller describes via `ReturnData`
  const body = (await response.json()) as GraphQlResponse<ReturnData>; // oxlint-disable-line typescript/no-unsafe-type-assertion -- `Response#json` returns `any`, the body is not validated here
  const { data, errors } = body;

  if (errors !== undefined || data === undefined || data === null) {
    throw new Error(errors?.[0]?.message ?? "No data and no errors returned");
  }

  return { data };
};
