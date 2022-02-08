/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";
import {
  BlockProtocolUpdateEntitiesFunction,
  BlockProtocolUpdateEntitiesAction,
} from "blockprotocol";

import Component from "./index";
import { ProviderNames } from "./types";
import { EmbedDataType, initialEmbedData } from "./mockData/mockData";

const node = document.getElementById("app");

/** Temporarily leaving this here, till we fix importing it from hash-shared */
const apiGraphQLEndpoint = "http://localhost:5001/graphql";

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

  const updateBlockData: BlockProtocolUpdateEntitiesFunction = async (
    actions: BlockProtocolUpdateEntitiesAction<any>[],
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
        updateEntities={updateBlockData}
        embedType={"Twitter"}
        initialHtml={
          '<blockquote class="twitter-tweet" data-width="300"><p lang="en" dir="ltr">1/ We&#39;ve been working a new protocol at <a href="https://twitter.com/hashintel?ref_src=twsrc%5Etfw">@hashintel</a><br><br>It&#39;s called the block protocol (but NOT about blockchain or NFTs!)<br><br>It allows you to build reusable blocks (aka. components) that are interchangeable across website/apps<br><br>It takes a minute to explain, but I’ve drawn pictures… <a href="https://t.co/9uhsPdAPSh">pic.twitter.com/9uhsPdAPSh</a></p>&mdash; Maggie Appleton 🧭 (@Mappletons) <a href="https://twitter.com/Mappletons/status/1488131234089873408?ref_src=twsrc%5Etfw">January 31, 2022</a></blockquote>\n<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>\n'
        }
        {...state}
      />
    </div>
  );
}

const App = () => {
  return <AppComponent />;
};

ReactDOM.render(<App />, node);
