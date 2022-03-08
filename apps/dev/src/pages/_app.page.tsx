import { VFC } from "react";
import type { AppProps } from "next/app";
import "../../styles/globals.css";

const MyApp: VFC<AppProps> = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default MyApp;
