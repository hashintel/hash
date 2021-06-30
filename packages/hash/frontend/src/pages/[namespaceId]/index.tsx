import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";

import styles from "../index.module.scss";
import { PageSidebar } from "../../components/layout/PageSidebar/PageSidebar";

export const NamespaceHome: VoidFunctionComponent = () => {
  const { query } = useRouter();
  const namespaceId = query.namespaceId as string;

  return (
    <div className={styles.MainWrapper}>
      <PageSidebar />
      <main className={styles.MainContent}>
        <header>
          <h1>Welcome to account #{namespaceId}</h1>
        </header>
        <p>
          Please select a page from the list.
        </p>
        <p>
          Or create a new page - <em>coming soon!</em>
        </p>
      </main>
    </div>
  );
};

export default NamespaceHome;
