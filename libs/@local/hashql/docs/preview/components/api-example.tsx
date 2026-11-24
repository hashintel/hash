import { Section } from "./section.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** An example, with its caption on the bar above its code. */
export function ApiExample({ children }: Components.ChildrenProps): ReactNode {
  return (
    <Section kind="example" title="Example">
      <div className="api-example">{children}</div>
    </Section>
  );
}
