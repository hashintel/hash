import styles from "../../pages/index.module.scss";
import { PageSidebar } from "../layout/PageSidebar/PageSidebar";

export default function MainComponentWithSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.MainWrapper}>
      <PageSidebar />
      <div className={styles.MainContent}>{children}</div>
    </div>
  );
}
