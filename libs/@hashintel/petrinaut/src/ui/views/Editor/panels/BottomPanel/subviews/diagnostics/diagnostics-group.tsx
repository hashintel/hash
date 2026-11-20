import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const entityGroupStyle = css({
  marginBottom: "[8px]",
});

const entityButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  width: "[100%]",
  padding: "[4px 0]",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s115",
  _hover: {
    color: "neutral.s120",
  },
});

const countStyle = css({
  fontWeight: "normal",
  color: "neutral.s100",
  "&[data-errors]": { color: "[#dc2626]" },
});

const expandedContentStyle = css({
  paddingLeft: "[16px]",
  marginTop: "[4px]",
});

/** A group of diagnostics under a heading that folds it away. */
export const DiagnosticsGroup = ({
  label,
  count,
  hasErrors,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  /** What the group holds, in words: "2 errors". */
  count: string;
  hasErrors: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className={entityGroupStyle}>
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={entityButtonStyle}
    >
      <Icon name={expanded ? "chevronDown" : "chevronRight"} size="xs" />
      <span>{label}</span>
      <span className={countStyle} data-errors={hasErrors ? "" : undefined}>
        ({count})
      </span>
    </button>
    {expanded && <div className={expandedContentStyle}>{children}</div>}
  </div>
);
