import { css } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const sliderStyle = css({
  height: "[4px]",
  appearance: "none",
  background: "neutral.s30",
  borderRadius: "[2px]",
  outline: "none",
  cursor: "pointer",
  "&:disabled": {
    opacity: "[0.5]",
    cursor: "not-allowed",
  },
  "&::-webkit-slider-thumb": {
    appearance: "none",
    width: "[12px]",
    height: "[12px]",
    borderRadius: "[50%]",
    background: "blue.s50",
    cursor: "pointer",
  },
  "&::-moz-range-thumb": {
    width: "[12px]",
    height: "[12px]",
    borderRadius: "[50%]",
    background: "blue.s50",
    cursor: "pointer",
    border: "none",
  },
});

type SliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Ref to the input element */
  ref?: React.Ref<HTMLInputElement>;
};

const SliderBase: React.FC<SliderProps> = ({ className, ref, ...props }) => (
  <input
    ref={ref}
    type="range"
    className={`${sliderStyle}${className ? ` ${className}` : ""}`}
    {...props}
  />
);

export const Slider = withTooltip(SliderBase, "inline");
