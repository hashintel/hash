/** @sync ../components/Snippet.tsx */
import "../../styles/globals.css";
import "../../styles/prism.css";
import "../../styles/legacy-mdx-components.scss";

import type { EmotionCache } from "@emotion/react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import type { DefaultSeoProps } from "next-seo";
import { DefaultSeo } from "next-seo";
import NextNProgress from "nextjs-progressbar";
import type { FunctionComponent } from "react";
import { useEffect } from "react";

import siteMap from "../../sitemap.json";
import { PageLayout } from "../components/page-layout";
import { SITE_DESCRIPTION, SITE_SOCIAL_COVER_IMAGE_URL } from "../config";
import { theme } from "../theme";
import { MuiProvider } from "../theme/mui-provider";
import type { NextPageWithLayout } from "../util/next-types";
import { SiteMapContext } from "./shared/sitemap-context";

const defaultSeoProps: DefaultSeoProps = {
  title: "HASH.dev – HASH for Developers",
  description: SITE_DESCRIPTION,
  twitter: {
    cardType: "summary_large_image",
    site: "@hashdevs",
  },
  openGraph: {
    images: [{ url: SITE_SOCIAL_COVER_IMAGE_URL }],
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
    <SiteMapContext.Provider value={siteMap}>
      <MuiProvider emotionCache={emotionCache} theme={theme}>
        <DefaultSeo {...defaultSeoProps} />
        <NextNProgress
          color="#05A2C2" // @todo use theme color when we switch to Design System colors
          height={2}
          options={{ showSpinner: false }}
          showOnShallow
        />
        {getLayout(<Component {...pageProps} />, router.asPath)}
      </MuiProvider>
    </SiteMapContext.Provider>
  );
};

export default MyApp;
