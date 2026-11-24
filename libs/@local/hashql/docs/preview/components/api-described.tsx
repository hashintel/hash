import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** What an item's comments say, after the numbers of the overloads they say it for when not for all of them. */
export function ApiDescribed({
  overloads,
  children,
}: Components.DescribedProps): ReactNode {
  if (overloads === undefined) {
    return <div className="api-item-description">{children}</div>;
  }

  return (
    <div className="api-item-description api-note">
      <Overloads numbers={overloads} />
      <div className="api-note-body">{children}</div>
    </div>
  );
}
