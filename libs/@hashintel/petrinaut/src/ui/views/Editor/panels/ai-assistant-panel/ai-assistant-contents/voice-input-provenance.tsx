import { css } from "@hashintel/ds-helpers/css";

const provenanceStyle = css({
  display: "inline-flex",
  height: "[14px]",
  alignItems: "center",
  alignSelf: "flex-end",
  gap: "[2px]",
  color: "blue.s70",
  "& > span": {
    display: "block",
    width: "[2px]",
    borderRadius: "full",
    backgroundColor: "[currentColor]",
  },
  "& > span:nth-child(1)": {
    height: "[4px]",
  },
  "& > span:nth-child(2)": {
    height: "[7px]",
  },
  "& > span:nth-child(3)": {
    height: "[11px]",
  },
  "& > span:nth-child(4)": {
    height: "[7px]",
  },
  "& > span:nth-child(5)": {
    height: "[4px]",
  },
});

export const VoiceInputProvenance = () => (
  <span aria-label="Voice input" className={provenanceStyle}>
    <span />
    <span />
    <span />
    <span />
    <span />
  </span>
);
