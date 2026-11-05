import { Rows } from "./rows.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** Rows without a title, such as a namespace's index or the overview's entrypoints. */
export function ApiIndex({ children }: Components.ChildrenProps): ReactNode {
  return <Rows>{children}</Rows>;
}
