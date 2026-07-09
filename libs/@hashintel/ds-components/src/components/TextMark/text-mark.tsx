import { cx, css } from "@hashintel/ds-helpers/css";
// TextMark wraps an element that comes at the end of text, but should never
// split onto its own line. Examples could be a * or other footnote, help tooltips etc.
//
// Note that Text mark only works when adjacent to an inline element
export const TextMark = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  return (
    <span className={cx(css({ whiteSpace: "nowrap" }), className)}>
      {"\u200B"}
      {children}
    </span>
  );
};
