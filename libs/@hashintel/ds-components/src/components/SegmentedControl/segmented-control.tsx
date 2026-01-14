import { SegmentGroup } from "@ark-ui/react/segment-group";
import { refractive } from "@hashintel/refractive";

import { css, cx } from "../../../styled-system/css";

// TODO: Segmented Control should just be implemented as in the Figma, without refractive effects.
// This version is just legacy for demo purposes.

const ROOT_PADDING = 4;
const ROOT_RADIUS = 10;

const rootStyles = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "3",
  userSelect: "none",
});

const rootBackdropStyles = css({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  backgroundColor: "gray.10/20",
  left: "[0px]",
  top: "[0px]",
  right: "[0px]",
  bottom: "[0px]",
  shadow: "[inset 1px 1px 1px rgba(0, 0, 0, 0.05)]",
});

const indicatorStyles = css({
  width: "var(--width)",
  height: "var(--height)",
  left: "var(--left)",
  top: "var(--top)",
  boxShadow: "sm",
  backgroundColor: "neutral.white/60",
  "[data-part='root']:active &": {
    backgroundColor: "neutral.white/60",
  },
});

const itemStyles = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  paddingX: "5",
  paddingY: "4",
  width: "auto",
  textAlign: "center",
  cursor: "pointer",
  transition: "all",
  transitionDuration: "200ms",
  _disabled: {
    cursor: "not-allowed",
    opacity: "0.6",
  },
  _focus: {
    shadow: "lg",
  },
  _hover: {
    backgroundColor: "neutral.white/60",
  },
});

const itemTextStyles = css({
  fontSize: "sm",
  fontWeight: "medium",
  _disabled: {
    opacity: "0.4",
  },
});

export type SegmentedControlProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  options: { name: string; value: string }[];
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}>;

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  className,
  style,
  options,
  value,
  defaultValue,
  disabled = false,
  onValueChange,
}) => {
  return (
    <SegmentGroup.Root
      value={value}
      onValueChange={(details) => {
        if (details.value) {
          onValueChange?.(details.value);
        }
      }}
      disabled={disabled}
      defaultValue={defaultValue}
      className={cx(rootStyles, className)}
      style={{
        ...style,
        padding: ROOT_PADDING,
        borderRadius: ROOT_RADIUS,
      }}
    >
      <refractive.div
        className={rootBackdropStyles}
        refraction={{
          radius: ROOT_RADIUS,
          blur: 2,
          bezelWidth: 22,
        }}
      />

      <SegmentGroup.Indicator
        className={indicatorStyles}
        style={{ borderRadius: ROOT_RADIUS - ROOT_PADDING }}
      />

      {options.map((option) => (
        <SegmentGroup.Item
          key={option.value}
          value={option.value}
          className={itemStyles}
          style={{ borderRadius: ROOT_RADIUS - ROOT_PADDING }}
        >
          <SegmentGroup.ItemText className={itemTextStyles}>
            {option.name}
          </SegmentGroup.ItemText>
          <SegmentGroup.ItemControl />
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
};
