/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";
import {
  BlockProtocolUpdateFn,
  BlockProtocolUpdatePayload,
} from "@hashintel/block-protocol";
// import { apiGraphQLEndpoint } from "@hashintel/hash-shared/environment";

import Component from "./index";
import { ProviderNames } from "./types";
import { EmbedDataType, initialEmbedData } from "./mockData/mockData";

const node = document.getElementById("app");

const apiGraphQLEndpoint = "http://localhost:5001/graphql"

async function getEmbedBlock(
  url: string,
  type?: ProviderNames,
): Promise<{
  html: string;
  error?: string;
  height?: number;
  width?: number;
}> {
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
}

function AppComponent() {
  const [state, setState] = useState<EmbedDataType>(initialEmbedData);

  const updateState = (newState: Partial<EmbedDataType>) => {
    setState((prevState) => ({
      ...prevState,
      ...newState,
    }));
  };

  const updateBlockData: BlockProtocolUpdateFn = async (
    actions: BlockProtocolUpdatePayload<any>[],
  ) => {
    if (actions[0]) {
      updateState(actions[0].data);
    }
    return actions[0].data;
  };

  return (
    <div className={tw`mt-4 w-1/2 mx-auto`}>
      <Component
        accountId="uuid-1234-account"
        type="uuid-1234-type"
        id="uuid-1234-id"
        entityId="uuid-1234-id"
        entityTypeId="Embed"
        getEmbedBlock={getEmbedBlock}
        update={updateBlockData}
        {...state}
      />
    </div>
  );
}

const App = () => {
  return <AppComponent />;
};

ReactDOM.render(<App />, node);
