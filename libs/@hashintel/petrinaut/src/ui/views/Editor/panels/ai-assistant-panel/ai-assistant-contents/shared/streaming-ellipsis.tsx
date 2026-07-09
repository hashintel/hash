import { css } from "@hashintel/ds-helpers/css";

const ellipsisStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "[3px]",
  marginLeft: "[2px]",
  color: "neutral.s70",
  "& > span": {
    display: "inline-block",
    width: "[3px]",
    height: "[3px]",
    borderRadius: "full",
    backgroundColor: "[currentColor]",
    animationName: "pulse",
    animationDuration: "[1.2s]",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "[infinite]",
  },
  "& > span:nth-child(2)": {
    animationDelay: "[0.15s]",
  },
  "& > span:nth-child(3)": {
    animationDelay: "[0.3s]",
  },
});

export const StreamingEllipsis = () => (
  <span aria-hidden="true" className={ellipsisStyle}>
    <span />
    <span />
    <span />
  </span>
);
