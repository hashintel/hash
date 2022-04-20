import Head from "next/head";
import { ReactElement, ReactNode, VFC } from "react";
import { isProduction } from "../../lib/config";

export const PlainLayout: VFC<{
  children?: ReactNode;
}> = ({ children }) => {
  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        {!isProduction ? <meta name="robots" content="noindex" /> : null}
      </Head>
      {children}
    </>
  );
};

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};
