import Head from "next/head";
import { ReactElement, ReactNode, VFC } from "react";
import { isProduction } from "../../../lib/config";
import { PageHeader } from "../../layout";

export const DefaultLayout: VFC<{
  children?: ReactNode;
  hidePageHeader?: boolean;
}> = ({ children, hidePageHeader }) => {
  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        {!isProduction ? <meta name="robots" content="noindex" /> : null}
      </Head>
      {!hidePageHeader && <PageHeader />}
      {children}
    </>
  );
};

export const getDefaultLayout = (page: ReactElement) => {
  return <DefaultLayout>{page}</DefaultLayout>;
};

export const getDefaultLayoutWithoutHeader = (page: ReactElement) => {
  return <DefaultLayout hidePageHeader>{page}</DefaultLayout>;
};
