/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import Component from "./index";

import { ProviderNames } from "./types/embedTypes";

import { BlockProtocolUpdateFn } from "@hashintel/block-protocol";

const node = document.getElementById("app");

function AppComponent() {
  async function getEmbedBlock(
    url: string,
    type?: ProviderNames
  ): Promise<{ html: string; error?: string }> {
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

  const updateBlockData: BlockProtocolUpdateFn = async () => {
    // do something with the data
  };

  return (
    <div style={{ marginTop: 12 }}>
      <Component
        accountId={"uuid-1234-account"}
        type={"uuid-1234-type"}
        id={"uuid-1234-id"}
        entityId={"uuid-1234-id"}
        entityTypeId="Embed"
        getEmbedBlock={getEmbedBlock}
        update={updateBlockData}
      />
    </div>
  );
}

const App = () => {
  return <AppComponent />;
};

ReactDOM.render(<App />, node);
