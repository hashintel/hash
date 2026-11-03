import type { ContentsProps } from "../../lib/components.js";
import type { ReactNode } from "react";

/** A module's index, on the page and in the rail beside it. */
export function ApiContents({ children }: ContentsProps): ReactNode {
  return <div className="api-contents">{children}</div>;
}
