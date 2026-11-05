import { Rows } from "./rows.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** One group of a module's index. */
export function ApiGroup({
  title,
  grouping,
  children,
}: Components.GroupProps): ReactNode {
  return (
    <Rows title={title} grouping={grouping}>
      {children}
    </Rows>
  );
}
