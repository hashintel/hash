import { Section } from "./section.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiSee({ children }: Components.ChildrenProps): ReactNode {
  return (
    <Section kind="see" title="See">
      {children}
    </Section>
  );
}
