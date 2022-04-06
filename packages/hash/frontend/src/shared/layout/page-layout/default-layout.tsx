import Head from "next/head";
import { ReactElement, ReactNode, VFC } from "react";
import { isProduction } from "../../../lib/config";
import { PageHeader } from "../../layout";

export const DefaultLayout: VFC<{ children?: ReactNode }> = ({ children }) => {
  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        {!isProduction ? <meta name="robots" content="noindex" /> : null}
      </Head>
      <PageHeader />
      {children}
    </>
  );
};

export const getDefaultLayout = (page: ReactElement) => {
  return <DefaultLayout>{page}</DefaultLayout>;
};
