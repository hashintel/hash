import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { AccountSelect } from "./AccountSelect";
import { AccountPageList } from "./AccountPageList";

import styles from "./PageSidebar.module.scss";

export const PageSidebar: VoidFunctionComponent = () => {
  const router = useRouter();
  const { accountId, pageId } = router.query as Record<string, string>;

  const goToAccount = (accountId: string) => router.push(`/${accountId}`);

  return (
    <nav className={styles.PageSidebar}>
      <div className={styles.PageSidebar__Section}>
        <header className={styles.PageSidebar__Section__Header}>
          <h2>Account</h2>
          <AccountSelect onChange={goToAccount} value={accountId} />
        </header>
      </div>
      <div className={styles.PageSidebar__Section}>
        <header className={styles.PageSidebar__Section__Header}>
          <h2>Pages</h2>
          <AccountPageList currentPageMetaId={pageId} accountId={accountId} />
        </header>
      </div>
    </nav>
  );
};
