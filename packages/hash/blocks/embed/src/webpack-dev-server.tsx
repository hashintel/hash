/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React, { useState } from "react";
import ReactDOM from "react-dom";
import Component from "./index";

import { ApolloProvider } from "@apollo/client";

import { ProviderNames } from "./types/embedTypes";
import { createApolloClient } from "../dev_src/graphql/createApolloClient";

import { BlockProtocolUpdateFn } from "./types/blockProtocol";

const node = document.getElementById("app");

const apolloClient = createApolloClient();

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

  const updateBlockData: BlockProtocolUpdateFn = (actions) => {
    // do something with the data
  };

  return (
    <div style={{ marginTop: 12 }}>
      <Component
        accountId={"uuid-1234-account"}
        type={"uuid-1234-type"}
        id={"uuid-1234-id"}
        childEntityId={"uuid-1234-id"}
        getEmbedBlock={getEmbedBlock}
        initialHtml={
          undefined

          // `<iframe src="https://www.youtube.com/embed/dlKBmzQbiyU?feature=oembed" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="" width="200" height="113" frameborder="0"></iframe>`

          //           `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Yep! So tricky to decide whether it’s a bad idea or people don’t “trust” you yet in the ecosystem.<br><br>Most signups have been from the demo but I have a few just from talking about it on here and the forum.</p>&mdash; Archie Edwards (@archiethedev) <a href="https://twitter.com/archiethedev/status/1415981800577544195?ref_src=twsrc%5Etfw">July 16, 2021</a></blockquote>
          // <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`
        }
        update={updateBlockData}
      />
    </div>
  );
}

const App = () => {
  return (
    <>
      <ApolloProvider client={apolloClient}>
        <AppComponent />
      </ApolloProvider>
    </>
  );
};

ReactDOM.render(<App />, node);
