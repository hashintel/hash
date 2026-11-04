/**
 * Marks a block that differs from the base build, on pages emitted by a diff
 * build. For `added` and `changed` the marker renders nothing itself — the
 * stylesheet decorates the element that follows it, so the marked markdown is
 * never nested inside JSX. A `removed` marker has no following block to
 * decorate, so it is the visible element: the removed source, collapsed.
 */

import "./diff-marker.css";

export interface DiffMarkerProps {
  status: "added" | "changed" | "removed";
  /** Source of the removed content, shown collapsed on `removed` markers. */
  content?: string;
}

export const DiffMarker = ({ status, content }: DiffMarkerProps) =>
  status === "removed" ? (
    <details className="arch-diff-removed">
      <summary>Removed content</summary>
      {content === undefined ? null : (
        <pre className="arch-diff-removed-source">{content}</pre>
      )}
    </details>
  ) : (
    <span className="arch-diff-marker" data-status={status} />
  );
