import type { ReactNode } from "react";

/** Rows under a title, such as a group of a module's index or an entry's relation, or without one, such as a namespace's index. */
export function Rows({
  title,
  grouping,
  relation,
  children,
}: {
  readonly title?: string | undefined;
  readonly grouping?: string | undefined;
  readonly relation?: string | undefined;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <div
      className="api-index not-prose"
      data-grouping={grouping}
      data-relation={relation}
    >
      {title === undefined ? null : <p className="api-index-title">{title}</p>}
      <ul className="api-index-rows">{children}</ul>
    </div>
  );
}
