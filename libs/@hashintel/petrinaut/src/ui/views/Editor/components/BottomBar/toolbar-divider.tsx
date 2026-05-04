import { css } from "@hashintel/ds-helpers/css";

const dividerStyle = css({
  background: "neutral.a40",
  boxShadow: "[1px 0 0 0 rgba(255, 255, 255, 0.6)]",
  width: "[1px]",
  height: "3",
  margin: "[0 4px]",
});

export const ToolbarDivider: React.FC = () => <div className={dividerStyle} />;
