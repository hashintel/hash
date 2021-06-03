import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "../graphql/createApolloClient";

import "../../styles/globals.css";
import { AppProps } from "next/dist/next-server/lib/router/router";

const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  );
}

export default MyApp;
