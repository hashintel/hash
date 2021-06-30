// @todo have webpack polyfill this
require("setimmediate");

import { AppProps } from "next/dist/next-server/lib/router/router";
import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "../graphql/createApolloClient";

import "../../styles/prism.css";
import "../../styles/globals.scss";

export const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  );
}

export default MyApp;
