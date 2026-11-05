import { Rows } from "./rows.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

export function ApiRelation({
  relation,
  title,
  children,
}: Components.RelationProps): ReactNode {
  return (
    <Rows title={title} relation={relation}>
      {children}
    </Rows>
  );
}
