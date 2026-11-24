import type { ReactNode } from "react";

/** A labelled part of an entry, with any tools for it on its title's line. */
export function Section({
  kind,
  title,
  tools,
  children,
}: {
  /** Which section of a comment it is, for a page that places comment sections apart. */
  readonly kind?: "remarks" | "custom" | "example" | "see";
  readonly title: ReactNode;
  readonly tools?: ReactNode;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <div className="api-section" data-section={kind}>
      <div className="api-section-header">
        <h4 className="api-section-title">{title}</h4>
        {tools === undefined ? null : (
          <div className="api-section-tools">{tools}</div>
        )}
      </div>
      {children}
    </div>
  );
}
