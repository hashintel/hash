import { useQuery, ApolloError } from "@apollo/client";
import { GetServerSideProps } from "next";
import Link from "next/link";

import {
  GetAccountPagesQuery,
  GetAccountPagesQueryVariables,
  GetAccountsQuery,
} from "../graphql/apiTypes.gen";
import {
  getAccountPages,
  getAccounts,
} from "../graphql/queries/account.queries";

import styles from "./index.module.scss";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const client = createApolloClient({
    additionalHeaders: { Cookie: req.headers.cookie },
  });

  const accounts = await client
    .query<GetAccountsQuery>({
      query: getAccounts,
    })
    .then(({ data }) => data.accounts)
    .catch(({ graphQLErrors }: ApolloError) => {
      console.log(graphQLErrors);

      const errorsToThrow = graphQLErrors.filter(
        ({ extensions }) => !extensions || extensions.code !== "FORBIDDEN"
      );

      if (errorsToThrow.length > 0) {
        throw new ApolloError({ graphQLErrors: errorsToThrow });
      }

      return null;
    });

  if (accounts) {
    const firstPage = await accounts.reduce(
      (promise, account) =>
        promise.then(async (page) => {
          if (!page) {
            const result = await client.query<
              GetAccountPagesQuery,
              GetAccountPagesQueryVariables
            >({
              query: getAccountPages,
              variables: {
                accountId: account.accountId,
              },
            });

            const pages = result.data.accountPages;
            if (pages.length > 0) {
              return `/${account.accountId}/${pages[0].metadataId}`;
            }
          }

          return page;
        }),
      Promise.resolve<null | string>(null)
    );

    if (firstPage) {
      return {
        redirect: {
          destination: firstPage,
          permanent: false,
        },
      };
    }
  }

  return { props: {} };
};

export default function Home() {
  const { data } = useQuery<GetAccountsQuery>(getAccounts);

  return (
    <main className={styles.Main}>
      <header>
        <h1>HASH.dev</h1>
      </header>

      <section>
        <h2>Accounts in this instance</h2>
        <ul>
          {data?.accounts.map((account) => (
            <li key={account.entityId}>
              <Link href={`/account/${account.entityId}`}>
                <a>{account.properties.shortname}</a>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Block playground</h2>
        <p>
          <Link href="/playground">
            <a>Click here to visit the block playground</a>
          </Link>
        </p>
      </section>
    </main>
  );
}
