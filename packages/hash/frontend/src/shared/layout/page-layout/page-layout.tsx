import { useRouter } from "next/router";
import { ReactNode, VFC } from "react";
import Head from "next/head";
import { PageHeader } from "../page-header";
import { isProd } from "../../../lib/environment";

const AUTH_ROUTES = ["/login", "/signup", "/invite"];

export const PageLayout: VFC<{ children?: ReactNode }> = ({ children }) => {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        {!isProd ? <meta name="robots" content="noindex" /> : null}
      </Head>
      {!AUTH_ROUTES.includes(router.pathname) ? <PageHeader /> : null}
      {children}
    </>
  );
};
