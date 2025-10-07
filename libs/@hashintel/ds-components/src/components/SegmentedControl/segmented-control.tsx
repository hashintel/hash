import { SegmentGroup } from "@ark-ui/react/segment-group";
import { css, cx } from "@hashintel/ds-helpers/css";
import { useId } from "react";

import { Filter } from "../../lib/flexible-filter";
import { CONVEX, LIP } from "../../lib/surface-equations";
import { useMotionResizeObserver } from "../../lib/use-motion-resize-observer";

const ROOT_PADDING = 4;

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
  const rootFilterId = `segmented-control-filter-${useId()}`;
  const indicatorFilterId = `segmented-control-indicator-filter-${useId()}`;

  const {
    ref: rootRef,
    width: rootMotionWidth,
    height: rootMotionHeight,
  } = useMotionResizeObserver<HTMLDivElement>({
    initialWidth: 10,
    initialHeight: 10,
  });

  const {
    ref: indicatorRef,
    width: indicatorMotionWidth,
    height: indicatorMotionHeight,
  } = useMotionResizeObserver<HTMLDivElement>({
    initialWidth: 10,
    initialHeight: 10,
  });

  // Define PandaCSS styles for the segment group components
  const rootStyles = css({
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "1",
    userSelect: "none",
  });

  const rootBackdropStyles = css({
    position: "absolute",
    display: "flex",
    alignItems: "center",
    backgroundColor: "gray.10/20",
    left: "0",
    top: "0",
    right: "0",
    bottom: "0",
    shadow: "[inset 1px 1px 1px rgba(0, 0, 0, 0.05)]",
  });

  const indicatorStyles = css({
    width: "var(--width)",
    height: "var(--height)",
    left: "var(--left)",
    top: "var(--top)",
    boxShadow: "sm",
    backgroundColor: "whiteAlpha.20",
    "[data-part='root']:active &": {
      backgroundColor: "whiteAlpha.10",
    },
  });

  const itemStyles = css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingX: "4",
    paddingY: "2",
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
      backgroundColor: "grayAlpha.40",
    },
  });

  const itemTextStyles = css({
    fontSize: "sm",
    fontWeight: "medium",
    _disabled: {
      opacity: "0.4",
    },
  });

  return (
    <>
      <Filter
        id={rootFilterId}
        blur={blur}
        scaleRatio={scaleRatio}
        specularOpacity={specularOpacity}
        width={rootMotionWidth}
        height={rootMotionHeight}
        radius={radius}
        bezelWidth={bezelWidth}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={CONVEX}
      />
      <Filter
        id={indicatorFilterId}
        blur={0}
        scaleRatio={scaleRatio}
        specularOpacity={specularOpacity}
        width={indicatorMotionWidth}
        height={indicatorMotionHeight}
        radius={radius - ROOT_PADDING}
        bezelWidth={bezelWidth - ROOT_PADDING}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={LIP}
      />

      <SegmentGroup.Root
        ref={rootRef}
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
        <div
          className={rootBackdropStyles}
          style={{
            borderRadius: radius,
            backdropFilter: `url(#${rootFilterId})`,
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

        <SegmentGroup.Indicator
          ref={indicatorRef}
          className={indicatorStyles}
          style={{
            borderRadius: radius - ROOT_PADDING,
            backdropFilter: `url(#${indicatorFilterId})`,
          }}
        />
      </SegmentGroup.Root>
    </>
  );
};
