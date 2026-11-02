import { Heading } from "@fumadocs/base-ui/components/heading";

import type { ExportProps } from "../../lib/components.js";
import type { ReactNode } from "react";

export function ApiExport({
  name,
  kind,
  source,
  children,
}: ExportProps): ReactNode {
  return (
    <section className="api-export">
      <div className="api-export-header">
        <Heading as="h3" id={name}>
          {name}
        </Heading>
        <span className="api-kind">{kind}</span>
        {source === undefined ? null : (
          <a className="api-source" href={source} aria-label="Source">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
            </svg>
          </a>
        )}
      </div>
      {children}
    </section>
  );
}
