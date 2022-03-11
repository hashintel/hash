import { EmotionCache } from "@emotion/react";
import type { AppProps } from "next/app";
import { VFC } from "react";
import "../../styles/globals.css";
import { theme } from "../theme";
import { MuiProvider } from "../theme/MuiProvider";

type MyAppProps = {
  emotionCache?: EmotionCache;
} & AppProps;

const MyApp: VFC<MyAppProps> = ({ Component, pageProps, emotionCache }) => {
  return (
    <MuiProvider emotionCache={emotionCache} theme={theme}>
      <Component {...pageProps} />
    </MuiProvider>
  );
};

export default MyApp;
