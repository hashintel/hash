import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { AccountSelect } from "./AccountSelect";
import { AccountPageList } from "./AccountPageList";

import styles from "./PageSidebar.module.scss";
import { AccountEntityTypeList } from "./AccountEntityTypeList";

export const PageSidebar: VoidFunctionComponent = () => {
  const router = useRouter();
  const { accountId, pageEntityId } = router.query as Record<string, string>;

  const goToAccount = (id: string) => router.push(`/${id}`);

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
          <AccountPageList
            currentPageEntityId={pageEntityId}
            accountId={accountId}
          />
        </header>
      </div>
      <div className={styles.PageSidebar__Section}>
        <header className={styles.PageSidebar__Section__Header}>
          <h2>Entities</h2>
          <AccountEntityTypeList accountId={accountId} />
        </header>
      </div>
    </nav>
  );
};
