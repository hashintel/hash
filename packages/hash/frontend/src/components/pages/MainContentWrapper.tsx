import { FunctionComponent } from "react";

import styles from "../../pages/index.module.scss";
import { PageSidebar } from "../layout/PageSidebar/PageSidebar";

export const MainContentWrapper: FunctionComponent = ({ children }) => {
  return (
    <div className={styles.MainWrapper}>
      <PageSidebar />
      <main className={styles.MainContent}>{children}</main>
    </div>
  );
};
