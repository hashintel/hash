import { css } from "@hashintel/ds-helpers/css";

const containerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  marginRight: "auto",
  minWidth: "[0]",
});

const badgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[18px]",
  height: "[18px]",
  borderRadius: "full",
  backgroundColor: "red.s100",
  color: "neutral.s00",
  fontSize: "[10px]",
  fontWeight: "semibold",
  flexShrink: 0,
});

const messageStyle = css({
  fontSize: "xs",
  color: "red.s100",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: "[0]",
});

interface ScenarioErrorDisplayProps {
  count: number;
  firstMessage?: string;
}

/**
 * Compact error summary for drawer footers: a red badge showing the count
 * and the first error message truncated with ellipsis.
 */
export const ScenarioErrorDisplay = ({
  count,
  firstMessage,
}: ScenarioErrorDisplayProps) => {
  if (count === 0) {
    return null;
  }
  return (
    <div className={containerStyle} title={firstMessage}>
      <span className={badgeStyle}>{count > 99 ? "99+" : count}</span>
      {firstMessage && <span className={messageStyle}>{firstMessage}</span>}
    </div>
  );
};
