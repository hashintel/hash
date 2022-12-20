/** @sync ../components/Snippet.tsx */
import "../../styles/globals.css";
import "../../styles/prism.css";

import { EmotionCache } from "@emotion/react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { DefaultSeo, DefaultSeoProps } from "next-seo";
import { useEffect, FunctionComponent } from "react";
import NextNProgress from "nextjs-progressbar";
import { PageLayout } from "../components/PageLayout";
import { theme } from "../theme";
import { MuiProvider } from "../theme/MuiProvider";
import { NextPageWithLayout } from "../util/nextTypes";
import { FRONTEND_URL, SITE_DESCRIPTION } from "../config";

const defaultSeoProps: DefaultSeoProps = {
  title: "HASH.dev – HASH for Developers",
  description: SITE_DESCRIPTION,
  twitter: {
    cardType: "summary_large_image",
    site: "@hashdevs",
  },
  openGraph: {
    images: [{ url: `${FRONTEND_URL}/social-cover.png` }],
    siteName: "HASH for Developers",
    type: "website",
  },
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

type MyAppProps = {
  emotionCache?: EmotionCache;
} & AppPropsWithLayout;

const MyApp: FunctionComponent<MyAppProps> = ({
  Component,
  pageProps,
  emotionCache,
}) => {
  const router = useRouter();

  // Use the layout defined at the page level, if available
  const getLayout =
    Component.getLayout ?? ((page) => <PageLayout>{page}</PageLayout>);

  useEffect(() => {
    const handleRouteChange = (url: string) => {
      window.gtag("config", "[Tracking ID]", {
        page_path: url,
      });
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return (
    <MuiProvider emotionCache={emotionCache} theme={theme}>
      <DefaultSeo {...defaultSeoProps} />
      <NextNProgress
        color="#05A2C2" // @todo use theme color when we switch to Design System colors
        height={2}
        options={{ showSpinner: false }}
        showOnShallow
      />
      {getLayout(<Component {...pageProps} />)}
    </MuiProvider>
  );
};

export default MyApp;
