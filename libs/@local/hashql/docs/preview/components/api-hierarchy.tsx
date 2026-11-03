import * as Diagram from "./diagram.js";

import type * as Components from "../../lib/components.js";
import type { ReactNode } from "react";

const label = "Type hierarchy";
const legend = "An arrow points from a type to the one it extends.";

/**
 * The button for an export's type hierarchy, which opens the diagram with the export's relations under it.
 *
 * The server renders the diagram, so the page carries no diagram code.
 */
export function ApiHierarchy({
  name,
  nodes,
  edges,
  children,
}: Components.HierarchyProps): ReactNode {
  const popover = `hierarchy-${name.replaceAll(/[^\w-]/gu, "-")}`;
  const current = nodes.find(({ role }) => role === "current")?.label ?? name;
  // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- rendered once, on the server
  const diagram = { __html: Diagram.diagramOf(popover, { nodes, edges }) };

  return (
    <>
      <button
        type="button"
        className="api-hierarchy-button"
        popoverTarget={popover}
        title={`What ${current} extends, and what extends it`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 1.5v4M8 5.5 3.5 10M8 5.5l4.5 4.5M3.5 10v4.5M12.5 10v4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {label}
      </button>
      <div id={popover} popover="auto" className="api-hierarchy-popover">
        <div className="api-hierarchy-title">
          {`${label} of `}
          <code>{current}</code>
          <span>{legend}</span>
        </div>
        <div
          className="api-hierarchy-diagram"
          // oxlint-disable-next-line react/no-danger -- the SVG is rendered here, from the names the extraction gives
          dangerouslySetInnerHTML={diagram}
        />
        {children}
      </div>
    </>
  );
}
