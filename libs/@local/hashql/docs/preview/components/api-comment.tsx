import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** One comment of an entry. A comment that holds in some overloads only starts with their numbers. */
export function ApiComment({
  overloads,
  children,
}: Components.CommentProps): ReactNode {
  if (overloads === undefined) {
    return (
      <div className="api-part api-comment" data-part="description">
        {children}
      </div>
    );
  }

  return (
    <div className="api-part api-comment api-note" data-part="description">
      <Overloads numbers={overloads} />
      <div className="api-note-body">{children}</div>
    </div>
  );
}
