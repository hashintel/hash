import { VFC } from "react";
import type { AppProps } from "next/app";

const MyApp: VFC<AppProps> = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default MyApp;
