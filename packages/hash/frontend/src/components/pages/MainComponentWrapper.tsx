import { FunctionComponent } from "react";

import styles from "../../pages/index.module.scss";
import { PageSidebar } from "../layout/PageSidebar/PageSidebar";

export const MainComponentWrapper: FunctionComponent = ({ children }) => {
  return (
    <div className={styles.MainWrapper}>
      <PageSidebar />
      <div className={styles.MainContent}>{children}</div>
    </div>
  );
};
