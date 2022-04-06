import { useEffect } from "react";
import { useRouter } from "next/router";
import { tw } from "twind";

import styles from "./index.module.scss";
import { useUser } from "../components/hooks/useUser";
import { NextPageWithLayout } from "../shared/layout";

const Home: NextPageWithLayout = () => {
  const router = useRouter();
  const { user, loading } = useUser();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user) {
      // Temporarily redirect logged in user to their account page
      void router.push(`/${user.accountId}`);
    } else {
      void router.push("/login");
    }
  }, [loading, router, user]);

  return (
    <main className={styles.Main}>
      <section
        style={{ marginTop: "30vh" }}
        className={tw`flex justify-center`}
      >
        <h1>Loading ...</h1>
      </section>
    </main>
  );
};

export default Home;
