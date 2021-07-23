import { ProviderNames } from "../../../../blocks/embed/src/types/embedTypes";

export async function fetchEmbedCode(url: string, type?: ProviderNames) {
  return fetch("http://localhost:5001/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName: "getEmbedCode",
      variables: { url, type },
      query:
        "query getEmbedCode($url: String!, $type: String) {\n  embedCode(url: $url, type: $type) {\n    html\n    providerName\n    __typename\n  }\n}\n",
    }),
  })
    .then((response) => response.json())
    .then((responseData) => ({
      html: responseData.data?.embedCode.html,
      error: responseData?.errors?.[0]?.message,
    }));
}
