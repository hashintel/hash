// @todo have webpack polyfill this
require("setimmediate");

import { AppProps } from "next/dist/next-server/lib/router/router";
import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "../graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";

import "../../styles/prism.css";
import "../../styles/globals.scss";

export const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ApolloProvider client={apolloClient}>
      <PageLayout>
        <Component {...pageProps} />
      </PageLayout>
    </ApolloProvider>
  );
}

export default withTwindApp(MyApp);
