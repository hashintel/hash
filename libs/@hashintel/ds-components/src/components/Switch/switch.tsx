import { Switch as BaseSwitch } from "@ark-ui/react/switch";
import { css } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

// Layout constants
const SLIDER_HEIGHT = 20;
const SLIDER_WIDTH = 34;
const SLIDER_RADIUS = SLIDER_HEIGHT / 2;

const THUMB_WIDTH = 14;
const THUMB_HEIGHT = 14;
const THUMB_RADIUS = THUMB_HEIGHT / 2;

const PADDING = SLIDER_RADIUS - THUMB_RADIUS;
const TRAVEL = SLIDER_WIDTH - THUMB_WIDTH - PADDING * 2;

const THUMB_SCALE_ACTIVE = 2.5;

const switchControlStyles = (disabled: boolean) =>
  css({
    position: "relative",
    display: "inline-block",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "[all 0.2s ease]",
    backgroundColor: "core.gray.40",
    _checked: {
      backgroundColor: "core.green.40",
    },
  });

const switchThumbStyles = css({
  position: "absolute",
  top: "[50%]",
  left: `[${PADDING}px]`,
  transition: "[all 0.2s ease]",
  "&[data-state='checked']": {
    transform: `translateY(-50%) translateX(${TRAVEL}px)`,
  },
  "&[data-state='unchecked']": {
    top: "[50%]",
    transform: "translateY(-50%)",
  },
  "& > div": {
    backgroundColor: "[rgba(255, 255, 255, 1)]",
  },
  "&[data-active] > div": {
    transform: `scale(${THUMB_SCALE_ACTIVE})`,
    backgroundColor: "[rgba(255, 255, 255, 0.1)]",
    shadow:
      "[0 2px 4px rgba(0,0,0,0.1), inset 0 1px 3px rgba(0,0,0,0.1), inset 0 -1px 3px rgba(255,255,255,0.1)]",
  },
});

const switchThumbInnerStyles = css({
  display: "block",
  width: `[${THUMB_WIDTH}px]`,
  height: `[${THUMB_HEIGHT}px]`,
  borderRadius: `[${THUMB_RADIUS}px]`,
  boxShadow: "[0 4px 22px rgba(0,0,0,0.1)]",
  transition: "[all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)]",
});

export interface SwitchProps {
  specularOpacity?: number;
  specularSaturation?: number;
  blurLevel?: number;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch: React.FC<SwitchProps> = ({
  specularOpacity = 0.5,
  specularSaturation = 6,
  blurLevel = 0.2,
  checked,
  defaultChecked = false,
  disabled = false,
  onCheckedChange,
}) => {
  return (
    <BaseSwitch.Root
      {...(checked !== undefined ? { checked } : { defaultChecked })}
      disabled={disabled}
      onCheckedChange={(details) => {
        onCheckedChange?.(details.checked);
      }}
    >
      <BaseSwitch.Control
        style={{
          width: SLIDER_WIDTH,
          height: SLIDER_HEIGHT,
          borderRadius: SLIDER_RADIUS,
        }}
        className={switchControlStyles(disabled)}
      >
        <BaseSwitch.Thumb className={switchThumbStyles}>
          <refractive.div
            className={switchThumbInnerStyles}
            refraction={{
              blur: blurLevel,
              specularOpacity,
              // specularSaturation,
              radius: THUMB_RADIUS,
              bezelWidth: THUMB_RADIUS * 0.42,
              glassThickness: 12,
              // bezelHeightFn: LIP,
              refractiveIndex: 1.5,
            }}
          />
        </BaseSwitch.Thumb>
      </BaseSwitch.Control>
      <BaseSwitch.HiddenInput />
    </BaseSwitch.Root>
  );
};
