import { cx } from "@hashintel/ds-helpers/css";

import {
  useOverlayContext,
  type OverlayBodyProps,
  type OverlayBody,
  type OverlayFooter,
  type OverlayFooterProps,
} from "../../util/overlay-parts";
import { Button } from "../Button/button";
import {
  containerStyles,
  headerActionsStyles,
  headerStyles,
  headerTitleStyles,
} from "./popover-parts.recipe";

export type PopoverHeaderProps = {
  /** Rendered in the uppercase label style at the start of the header */
  title?: React.ReactNode;
  /** Content (typically buttons) rendered at the end, before the close button */
  actions?: React.ReactNode;
  /** Hides the close button that otherwise closes the popover via its `onClose` */
  hideCloseButton?: boolean;
};

export const PopoverHeader = ({
  title,
  actions,
  hideCloseButton,
}: PopoverHeaderProps) => {
  const { onClose } = useOverlayContext();

  const showCloseButton = !hideCloseButton && !!onClose;

  return (
    <div className={headerStyles}>
      {/* Float first in source order so the title wraps around it. */}
      {(actions || showCloseButton) && (
        <div className={headerActionsStyles}>
          {actions}
          {showCloseButton && (
            <Button
              aria-label="Close"
              size="xs"
              variant="ghost"
              iconName="close"
              tooltip="Close"
              onClick={() => onClose()}
            />
          )}
        </div>
      )}
      <div className={headerTitleStyles}>{title}</div>
    </div>
  );
};

/** A single Header / Body / Footer panel accepted by `Popover.Container`. */
type PopoverPanel =
  | React.ReactElement<PopoverHeaderProps, typeof PopoverHeader>
  | React.ReactElement<OverlayBodyProps, typeof OverlayBody>
  | React.ReactElement<OverlayFooterProps, typeof OverlayFooter>;

export type PopoverContainerProps = {
  /** One or more Header / Body / Footer panels making up the popover */
  children: PopoverPanel | PopoverPanel[];
  className?: string;
};

/**
 * Styled, bordered popover frame that lays out the Header / Body / Footer
 * panels. Rendered inside a `Popover`.
 */
export const PopoverContainer = ({
  children,
  className,
}: PopoverContainerProps) => (
  <div className={cx(containerStyles, className)}>{children}</div>
);
