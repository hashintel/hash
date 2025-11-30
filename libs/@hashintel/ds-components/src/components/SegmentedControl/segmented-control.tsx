import { SegmentGroup } from "@ark-ui/react/segment-group";
import { css, cx } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

const ROOT_PADDING = 4;

const RefractiveSegmentGroupIndicator = refractive(SegmentGroup.Indicator);

const rootStyles = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "spacing.1",
  userSelect: "none",
});

const rootBackdropStyles = css({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  backgroundColor: "core.gray.10/20",
  left: "spacing.0",
  top: "spacing.0",
  right: "spacing.0",
  bottom: "spacing.0",
  shadow: "[inset 1px 1px 1px rgba(0, 0, 0, 0.05)]",
});

const indicatorStyles = css({
  width: "var(--width)",
  height: "var(--height)",
  left: "var(--left)",
  top: "var(--top)",
  boxShadow: "sm",
  backgroundColor: "core.neutral.white/20",
  "[data-part='root']:active &": {
    backgroundColor: "core.neutral.white/10",
  },
});

const itemStyles = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  paddingX: "spacing.4",
  paddingY: "spacing.2",
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
    backgroundColor: "core.grayalpha.40",
  },
});

const itemTextStyles = css({
  fontSize: "size.textsm",
  fontWeight: "medium",
  _disabled: {
    opacity: "0.4",
  },
});

export type SegmentedControlProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  radius?: number;
  blur?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  scaleRatio?: number;
  bezelWidth?: number;
  glassThickness?: number;
  refractiveIndex?: number;
  options: { name: string; value: string }[];
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}>;

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  className,
  style,
  radius = 22,
  blur = 2,
  specularOpacity = 0.4,
  scaleRatio = 1,
  bezelWidth = 20,
  glassThickness = 16,
  refractiveIndex = 1.5,
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
        padding: ROOT_PADDING,
        borderRadius: radius,
        ...style,
      }}
    >
      <refractive.div
        className={rootBackdropStyles}
        style={{
          borderRadius: radius,
        }}
        refraction={{
          blur,
          specularOpacity,
          radius,
          bezelWidth,
          glassThickness,
          refractiveIndex,
        }}
      />

      {options.map((option) => (
        <SegmentGroup.Item
          key={option.value}
          value={option.value}
          className={itemStyles}
          style={{ borderRadius: radius - ROOT_PADDING }}
        >
          <SegmentGroup.ItemText className={itemTextStyles}>
            {option.name}
          </SegmentGroup.ItemText>
          <SegmentGroup.ItemControl />
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}

      <RefractiveSegmentGroupIndicator
        className={indicatorStyles}
        style={{
          borderRadius: radius - ROOT_PADDING,
        }}
        refraction={{
          blur: 0,
          specularOpacity,
          radius: radius - ROOT_PADDING,
          bezelWidth: bezelWidth - ROOT_PADDING,
          glassThickness,
          refractiveIndex,
        }}
      />
    </SegmentGroup.Root>
  );
};
