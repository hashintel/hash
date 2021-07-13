import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { NamespaceSelect } from "./NamespaceSelect";
import { NamespacePageList } from "./NamespacePageList";

import styles from "./PageSidebar.module.scss";

export const PageSidebar: VoidFunctionComponent = () => {
  const router = useRouter();
  const { namespaceId, pageId } = router.query as Record<string, string>;

  const goToNamespace = (namespaceId: string) => router.push(`/${namespaceId}`);

  return (
    <nav className={styles.PageSidebar}>
      <div className={styles.PageSidebar__Section}>
        <header className={styles.PageSidebar__Section__Header}>
          <h2>Account</h2>
          <NamespaceSelect onChange={goToNamespace} value={namespaceId} />
        </header>
      </div>
      <div className={styles.PageSidebar__Section}>
        <header className={styles.PageSidebar__Section__Header}>
          <h2>Pages</h2>
          <NamespacePageList currentPageId={pageId} namespaceId={namespaceId} />
        </header>
      </div>
    </nav>
  );
};
