import styles from "./side-by-side.module.css";

import type { ReactNode } from "react";

/**
 * Blocks set beside each other, such as two groups of tabs to compare. They
 * stack when the article is too narrow for both, whatever the viewport.
 */
export function SideBySide({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className={styles["side-by-side"]} data-side-by-side="">
      <div className={styles["side-by-side-columns"]}>{children}</div>
    </div>
  );
}
