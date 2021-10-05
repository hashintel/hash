// @todo have webpack polyfill this
import { useRouter } from "next/router";
import { AppProps } from "next/dist/next-server/lib/router/router";
import { ApolloProvider } from "@apollo/client/react";
import { useEffect } from "react";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { ModalProvider } from "react-modal-hook";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";

import twindConfig from "../../twind.config";
import "../../styles/prism.css";
import "../../styles/globals.scss";
import { useUser } from "../components/hooks/useUser";

require("setimmediate");

export const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const { user } = useUser({ client: apolloClient });

  useEffect(() => {
    if (
      user &&
      !user.accountSignupComplete &&
      !router.pathname.startsWith("/signup")
    ) {
      void router.push("/signup");
    }
  }, [user, router]);

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

export default withTwindApp(twindConfig, MyApp);
