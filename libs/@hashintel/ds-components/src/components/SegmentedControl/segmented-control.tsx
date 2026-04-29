import { SegmentGroup } from "@ark-ui/react/segment-group";
import { css, cx } from "@hashintel/ds-helpers/css";

// TODO: Segmented Control should just be implemented as in the Figma.
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
  pointerEvents: "none",
  backgroundColor: "neutral.s10/20",
  backdropFilter: "[blur(2px)]",
  left: "[0px]",
  top: "[0px]",
  right: "[0px]",
  bottom: "[0px]",
  border: "[1px solid rgba(255,255,255,0.35)]",
  shadow: "[inset 1px 1px 1px rgba(0, 0, 0, 0.05)]",
});

const indicatorStyles = css({
  width: "var(--width)",
  height: "var(--height)",
  left: "var(--left)",
  top: "var(--top)",
  boxShadow: "sm",
  backgroundColor: "white/60",
  "[data-part='root']:active &": {
    backgroundColor: "white/60",
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
    backgroundColor: "white/60",
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
      <div
        className={rootBackdropStyles}
        style={{ borderRadius: ROOT_RADIUS }}
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
