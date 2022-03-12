import { useRouter } from "next/router";
import { FC } from "react";
import Head from "next/head";
import { PageHeader } from "../PageHeader/PageHeader";
import { isProd } from "../../../lib/environment";
import { useUser } from "../../hooks/useUser";

const AUTH_ROUTES = ["/login", "/signup", "/invite"];

export const PageLayout: FC = ({ children }) => {
  const router = useRouter();

  const { user } = useUser();

  const { accountId } = router.query as Record<string, string>;

  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        {!isProd ? <meta name="robots" content="noindex" /> : null}
      </Head>
      {!AUTH_ROUTES.includes(router.pathname) ? (
        // Presently, accountId is passed down as either the page's accountId, or the accountId of the user, if route doesn't have accountId in it.
        // @todo replace with a more standardized way of fetching a page's accountId
        <PageHeader accountId={accountId ?? user?.accountId!} />
      ) : null}
      {children}
    </>
  );
};
