import { Section } from "./section.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiMembers({ children }: Components.ChildrenProps): ReactNode {
  return (
    <div className="api-part" data-part="members">
      <Section title="Members">{children}</Section>
    </div>
  );
}
