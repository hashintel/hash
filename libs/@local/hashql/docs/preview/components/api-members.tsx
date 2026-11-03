import type { MembersProps } from "../../lib/components.js";
import type { ReactNode } from "react";

const title = "Members";

/** The members of an interface or a class, as a table of name and declaration. */
export function ApiMembers({ children }: MembersProps): ReactNode {
  return (
    <div className="api-members">
      <h4 className="api-section-title">{title}</h4>
      <div className="api-members-list">{children}</div>
    </div>
  );
}
