import { EmotionCache } from "@emotion/react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect, VFC } from "react";
import "../../styles/globals.css";
import { PageLayout } from "../components/PageLayout";
import { theme } from "../theme";
import { MuiProvider } from "../theme/MuiProvider";
import { NextPageWithLayout } from "../util/nextTypes";

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

type MyAppProps = {
  emotionCache?: EmotionCache;
} & AppPropsWithLayout;

const MyApp: VFC<MyAppProps> = ({ Component, pageProps, emotionCache }) => {
  const router = useRouter();

  // Use the layout defined at the page level, if available
  const getLayout =
    Component.getLayout ?? ((page) => <PageLayout>{page}</PageLayout>);

  useEffect(() => {
    const handleRouteChange = (url: string) => {
      (window as any).gtag?.("config", "[Tracking ID]", {
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
      {getLayout(<Component {...pageProps} />)}
    </MuiProvider>
  );
};

export default MyApp;
