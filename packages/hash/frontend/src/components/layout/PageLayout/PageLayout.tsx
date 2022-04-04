import { useRouter } from "next/router";
import { FC } from "react";
import Head from "next/head";
import { PageHeader } from "../PageHeader/PageHeader";
import { isProd } from "../../../lib/environment";
import { useCurrentWorkspaceInfo } from "../../../shared/routing";

const AUTH_ROUTES = ["/login", "/signup", "/invite"];

export const PageLayout: FC = ({ children }) => {
  const router = useRouter();
  const { accountId } = useCurrentWorkspaceInfo();

  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        {!isProd ? <meta name="robots" content="noindex" /> : null}
      </Head>
      {!AUTH_ROUTES.includes(router.pathname) ? (
        <PageHeader accountId={accountId} />
      ) : null}
      {children}
    </>
  );
};
