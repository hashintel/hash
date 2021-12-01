import { useEffect } from "react";
import { useRouter } from "next/router";
import { tw } from "twind";

import styles from "./index.module.scss";
import { useUser } from "../components/hooks/useUser";

export default function Home() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (user) {
      // Temporarily redirect logged in user to their account page
      void router.push(`/${user.accountId}`);
    } else {
      void router.push("/login");
    }
  }, [router, user]);

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
}
