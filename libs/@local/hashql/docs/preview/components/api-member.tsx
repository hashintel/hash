import { Facts } from "./facts.js";
import { Glyph } from "./glyph.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

/** One row of a members table: the member's name, then its declaration and documentation. */
export function ApiMember({
  name,
  title,
  kind,
  since,
  stability,
  internal,
  deprecated,
  children,
}: Components.MemberProps): ReactNode {
  return (
    <div className="api-member" id={name} data-kind={kind}>
      <div className="api-member-header">
        <a className="api-member-name" href={`#${name}`}>
          <Glyph kind={kind} />
          <span
            className="api-name"
            data-deprecated={deprecated === true ? "" : undefined}
          >
            {title}
          </span>
        </a>
        <Facts since={since} stability={stability} internal={internal} />
      </div>
      <div className="api-member-body">{children}</div>
    </div>
  );
}
