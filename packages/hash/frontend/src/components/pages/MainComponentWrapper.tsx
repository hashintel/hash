import { ReactNode } from "react";

import styles from "../../pages/index.module.scss";
import { PageSidebar } from "../layout/PageSidebar/PageSidebar";

export const MainComponentWrapper: React.VoidFunctionComponent<{
  children: ReactNode;
}> = ({ children }) => {
  return (
    <div className={styles.MainWrapper}>
      <PageSidebar />
      <div className={styles.MainContent}>{children}</div>
    </div>
  );
};
