import { Facts } from "./facts.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** A member as an item of a list, with its declaration as the item's line of code and its documentation under it. */
export function ApiMember({
  name,
  since,
  stability,
  internal,
  deprecated,
  children,
}: Components.MemberProps): ReactNode {
  return (
    <div
      className="api-item api-member"
      id={name}
      data-deprecated={deprecated === true ? "" : undefined}
    >
      <Facts since={since} stability={stability} internal={internal} />
      {children}
    </div>
  );
}
