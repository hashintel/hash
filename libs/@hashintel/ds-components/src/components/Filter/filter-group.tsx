import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./filter-group.recipe";

/**
 * Lays out a collection of `Filter` chips — and any interleaved controls
 * (buttons, dropdowns, ...) — as a wrapping flex row. Purely presentational:
 * the children manage their own state.
 */
export const FilterGroup = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div role="group" className={cx(styles, className)}>
      {children}
    </div>
  );
};
