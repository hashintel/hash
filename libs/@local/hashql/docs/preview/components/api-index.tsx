import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** A group of rows under its title, in a module's index, an entry's relations or the overview. */
export function ApiIndex({
  title,
  children,
}: Components.IndexProps): ReactNode {
  return (
    <div className="api-index not-prose">
      {title === "" ? null : <p className="api-index-title">{title}</p>}
      <ul className="api-index-rows">{children}</ul>
    </div>
  );
}
