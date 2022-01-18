import { JSONObject } from "blockprotocol";
import { apiGraphQLEndpoint } from "@hashintel/hash-shared/environment";

export type FetchEmbedCodeFn = (
  url: string,
  type?: string,
) => Promise<JSONObject>;

export const fetchEmbedCode: FetchEmbedCodeFn = (url, type?) => {
  return fetch(apiGraphQLEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName: "getEmbedCode",
      variables: { url, type },
      query:
        "query getEmbedCode($url: String!, $type: String) {\n  embedCode(url: $url, type: $type) {\n    html\n    providerName\n     height\n     width\n    __typename\n  }\n}\n",
    }),
  })
    .then((response) => response.json())
    .then((responseData) => ({
      ...responseData.data?.embedCode,
      error: responseData?.errors?.[0]?.message,
    }));
};
