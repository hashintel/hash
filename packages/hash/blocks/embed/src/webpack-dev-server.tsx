/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import { BlockProtocolUpdateFn } from "@hashintel/block-protocol";
import Component from "./index";

import { ProviderNames } from "./types/embedTypes";

const node = document.getElementById("app");

const INITIAL_HTML = `<iframe id=\"cp_embed_mdmQjEQ\" src=\"https://codepen.io/teenoh/embed/preview/mdmQjEQ?default-tabs=css%2Cresult&amp;height=300&amp;host=https%3A%2F%2Fcodepen.io&amp;slug-hash=mdmQjEQ\" title=\"Javascripters CSS battle\" scrolling=\"no\" frameborder=\"0\" height=\"300\" allowtransparency=\"true\" class=\"cp_embed_iframe\" style=\"width: 100%; overflow: hidden;\"></iframe>`

function AppComponent() {
  const getEmbedBlock = async (
    url: string,
    type?: ProviderNames
  ): Promise<{ html: string; error?: string }> => {
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
  };

  const updateBlockData: BlockProtocolUpdateFn = async () => {
    // do something with the data
  };

  return (
    <div style={{ marginTop: 12 }}>
      <Component
        accountId="uuid-1234-account"
        type="uuid-1234-type"
        id="uuid-1234-id"
        entityId="uuid-1234-id"
        entityTypeId="Embed"
        getEmbedBlock={getEmbedBlock}
        update={updateBlockData}
        // initialHtml={INITIAL_HTML}
      />
    </div>
  );
}

const App = () => {
  return <AppComponent />;
};

ReactDOM.render(<App />, node);
