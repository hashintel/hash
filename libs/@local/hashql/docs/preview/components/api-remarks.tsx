import { Section } from "./section.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiRemarks({ children }: Components.ChildrenProps): ReactNode {
  return (
    <Section kind="remarks" title="Remarks">
      {children}
    </Section>
  );
}
