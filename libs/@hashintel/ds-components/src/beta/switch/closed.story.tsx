import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import * as ParkSwitch from "./switch";

export interface SwitchProps extends ParkSwitch.RootProps {
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  rootRef?: RefObject<HTMLLabelElement | null>;
  trackLabel?: { on: ReactNode; off: ReactNode };
  thumbLabel?: { on: ReactNode; off: ReactNode };
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (props, ref) => {
    const {
      inputProps,
      children,
      rootRef = null,
      trackLabel,
      thumbLabel,
      ...rest
    } = props;

    return (
      <ParkSwitch.Root ref={rootRef} {...rest}>
        <ParkSwitch.HiddenInput ref={ref} {...inputProps} />
        <ParkSwitch.Control>
          <ParkSwitch.Thumb>
            {thumbLabel && (
              <ParkSwitch.ThumbIndicator fallback={thumbLabel?.off}>
                {thumbLabel?.on}
              </ParkSwitch.ThumbIndicator>
            )}
          </ParkSwitch.Thumb>
          {trackLabel && (
            <ParkSwitch.Indicator fallback={trackLabel.off}>
              {trackLabel.on}
            </ParkSwitch.Indicator>
          )}
        </ParkSwitch.Control>
        {children != null && <ParkSwitch.Label>{children}</ParkSwitch.Label>}
      </ParkSwitch.Root>
    );
  },
);
