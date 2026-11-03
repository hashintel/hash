import { Facts } from "./facts.js";
import { Glyph } from "./glyph.js";

import type { MemberProps } from "../../lib/components.js";
import type { ReactNode } from "react";

/** One row of a members table: the member's name, then its declaration and documentation. */
export function ApiMember({
  name,
  title,
  kind,
  since,
  stability,
  children,
}: MemberProps): ReactNode {
  return (
    <div className="api-member" id={name} data-kind={kind}>
      <div className="api-member-header">
        <a className="api-member-name" href={`#${name}`}>
          <Glyph kind={kind} />
          {title}
        </a>
        <Facts since={since} stability={stability} />
      </div>
      <div className="api-member-body">{children}</div>
    </div>
  );
}
