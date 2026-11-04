import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** A list under its title, each item a line of code over its description. */
export function ApiList({ title, children }: Components.ListProps): ReactNode {
  return (
    <div className="api-list">
      <h4 className="api-section-title">{title}</h4>
      {children}
    </div>
  );
}
