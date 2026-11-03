import { slotted } from "./slots.js";

import type { SectionProps } from "../../lib/components.js";
import type { ReactNode } from "react";

/** A labelled part of an entry, with the button for its hierarchy, when it has one, on its title's line. */
export function ApiSection({
  title,
  keyword,
  children,
}: SectionProps): ReactNode {
  const { slot: tools, rest } = slotted(children, "title");

  return (
    <div className="api-section" data-keyword={keyword}>
      <div className="api-section-header">
        <h4 className="api-section-title">
          {keyword === undefined ? null : (
            <span className="api-keyword" data-kind={keyword}>
              {`${keyword} `}
            </span>
          )}
          {title}
        </h4>
        {tools.length === 0 ? null : (
          <div className="api-section-tools">{tools}</div>
        )}
      </div>
      {rest}
    </div>
  );
}
