// @todo have webpack polyfill this
require("setimmediate");

import { AppProps } from "next/dist/next-server/lib/router/router";
import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "@hashintel/hash-shared/src/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";
import { ModalProvider } from "react-modal-hook";
import { Transition } from "@headlessui/react";

import "../../styles/prism.css";
import "../../styles/globals.scss";

export const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ApolloProvider client={apolloClient}>
      <ModalProvider>
        <PageLayout>
          <Component {...pageProps} />
        </PageLayout>
      </ModalProvider>
    </ApolloProvider>
  );
}

export default withTwindApp(MyApp);
