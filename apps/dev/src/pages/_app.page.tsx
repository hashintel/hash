import { CacheProvider, EmotionCache } from "@emotion/react";
import { ThemeProvider } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import type { AppProps } from "next/app";
import { VFC } from "react";
import "../../styles/globals.css";
import { theme } from "../theme";
import { createEmotionCache } from "../util/createEmotionCache";

const clientSideEmotionCache = createEmotionCache();

type MyAppProps = {
  emotionCache?: EmotionCache;
} & AppProps;

const MyApp: VFC<MyAppProps> = ({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}) => {
  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </CacheProvider>
  );
};

export default MyApp;
