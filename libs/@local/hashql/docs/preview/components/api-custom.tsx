import { Section } from "./section.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** A configured tag's block, under the tag's name. */
export function ApiCustom({
  tag,
  children,
}: Components.CustomProps): ReactNode {
  return (
    <Section kind="custom" title={tag.replace(/^@/u, "")}>
      {children}
    </Section>
  );
}
