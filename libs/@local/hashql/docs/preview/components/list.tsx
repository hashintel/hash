import type { ReactNode } from "react";

/** A list under its title, each item a line of code over its description. */
export function List({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <div className="api-part" data-part="details">
      <div className="api-list">
        <h4 className="api-section-title">{title}</h4>
        {children}
      </div>
    </div>
  );
}
