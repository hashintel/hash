/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React, { useState } from "react";
import ReactDOM from "react-dom";
import Component from "./index";

import { ApolloProvider, useQuery } from "@apollo/client";
import { getEmbedCode } from "../dev_src/graphql/queries/embed.queries";
import { ProviderNames } from "./types/embedTypes";
import { createApolloClient } from "../dev_src/graphql/createApolloClient";

const node = document.getElementById("app");

const apolloClient = createApolloClient();

function AppComponent() {
  const [blockState, setBlockState] = useState<{
    url: string;
    type?: ProviderNames;
  }>({ url: "", type: undefined });

  const { url, type } = blockState;

  const { data, error, loading } = useQuery(getEmbedCode, {
    variables: { url, type },
  });

  console.log(url, type, data);

  function getEmbedBlock(url: string, type?: ProviderNames) {
    setBlockState({ url, type });
  }

  return <Component getEmbedBlock={getEmbedBlock} html={data} />;
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
