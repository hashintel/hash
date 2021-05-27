import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "../graphql/createApolloClient";

import "../../styles/globals.css";

const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }) {
  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />;
    </ApolloProvider>
  );
}

export default MyApp;
