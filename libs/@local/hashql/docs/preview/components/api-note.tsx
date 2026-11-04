import { Overloads } from "./overloads.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** What an item's documentation says in some overloads, after their numbers. */
export function ApiNote({
  overloads,
  children,
}: Components.NoteProps): ReactNode {
  return (
    <div className="api-note">
      <Overloads numbers={overloads} />
      <div className="api-note-body">{children}</div>
    </div>
  );
}
