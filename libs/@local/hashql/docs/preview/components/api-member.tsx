import { Facts } from "./facts.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** A member as an item of a list, with its declaration as the item's line of code and its documentation under it. Each declaration carries its own deprecation, so a deprecated member strikes its declarations through and never its documentation. */
export function ApiMember({
  name,
  since,
  stability,
  internal,
  source,
  children,
}: Components.MemberProps): ReactNode {
  return (
    <div className="api-item api-member" id={name}>
      <Facts
        since={since}
        stability={stability}
        internal={internal}
        source={source}
      />
      {children}
    </div>
  );
}
