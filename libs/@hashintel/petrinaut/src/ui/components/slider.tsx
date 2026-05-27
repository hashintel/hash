import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ComponentProps } from "react";

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
    width: "[14px]",
    height: "[14px]",
    borderRadius: "[50%]",
    background: "blue.s90",
    cursor: "pointer",
  },
  "&::-moz-range-thumb": {
    width: "[14px]",
    height: "[14px]",
    borderRadius: "[50%]",
    background: "blue.s90",
    cursor: "pointer",
    border: "none",
  },
});

type SliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Ref to the input element */
  ref?: React.Ref<HTMLInputElement>;
  tooltip?: string;
  tooltipOptions?: Omit<ComponentProps<typeof Tooltip>, "children" | "content">;
};

export const Slider: React.FC<SliderProps> = ({
  className,
  ref,
  tooltip,
  tooltipOptions,
  ...props
}) => {
  const element = (
    <input
      ref={ref}
      type="range"
      className={`${sliderStyle}${className ? ` ${className}` : ""}`}
      {...props}
    />
  );

  if (!tooltip) {
    return element;
  }

  return (
    <Tooltip {...tooltipOptions} content={tooltip}>
      {element}
    </Tooltip>
  );
};
