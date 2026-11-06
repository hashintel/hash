import { Overloads } from "./overloads.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** Sections of one comment of an entry, which the entry places in reading order. A comment that holds in some overloads only starts with their numbers. */
export function ApiComment({
  overloads,
  children,
}: Components.CommentProps): ReactNode {
  if (overloads === undefined) {
    return <div className="api-comment">{children}</div>;
  }

  return (
    <div className="api-comment api-note">
      <Overloads numbers={overloads} />
      <div className="api-note-body">{children}</div>
    </div>
  );
}
