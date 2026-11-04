import { Overloads } from "./overloads.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** One type of an item, after the numbers of the overloads it holds in when it does not hold in all of them. */
export function ApiTerm({
  overloads,
  children,
}: Components.TermProps): ReactNode {
  return (
    <span className="api-term">
      {overloads === "" ? null : <Overloads numbers={overloads} />}
      {children}
    </span>
  );
}
