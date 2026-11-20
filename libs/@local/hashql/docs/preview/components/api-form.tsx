import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** One type of an item, after the numbers of the overloads it holds in when it does not hold in all of them. */
export function ApiForm({
  overloads,
  children,
}: Components.FormProps): ReactNode {
  return (
    <span
      className="api-term"
      data-whole={overloads === undefined ? "" : undefined}
    >
      {overloads === undefined ? null : <Overloads numbers={overloads} />}
      {children}
    </span>
  );
}
