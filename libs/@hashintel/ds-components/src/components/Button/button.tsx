import { useContext } from "react";

/* eslint-disable react/destructuring-assignment, react/button-has-type, @typescript-eslint/prefer-nullish-coalescing */
import { cx } from "@hashintel/ds-helpers/css";

import { resolveAutoFocusProps } from "../../util/form-shared";
import { TriggerPressedContext } from "../../util/trigger-pressed-context";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { Tooltip } from "../Tooltip/tooltip";
import { iconSizeMap } from "./button-util";
import { styles } from "./button.recipe";

import type { FormInputSize, Tone } from "../../util/form-shared";
import type { ExclusifyUnion, RequireAtLeastOne } from "type-fest";

export type Variant = "solid" | "subtle" | "ghost" | "link" | "linkSubtle";

type SharedButtonProps<Element extends HTMLButtonElement | HTMLAnchorElement> =
  {
    className?: string;
    /** The overall visual style, from `solid` fill to inline `link` text; `subtle` and `ghost` sit between with a tinted or transparent background. */
    variant?: Variant;
    /** The color treatment of the button, e.g. for primary or destructive actions. */
    tone?: Exclude<Tone, "warning" | "success">;
    /** The size (height) of the button */
    size?: FormInputSize;
    /** The shape of the button. Non default shapes should very rarely be used */
    shape?: "default" | "round";
    /** Whether the button is in a loading state */
    loading?: boolean;
    /** Whether the button is in a pressed/active state */
    pressed?: boolean;
    disabled?: boolean;
    tabIndex?: number;
    /** Whether to focus the element on mount; `"never"` prevents the element being focused automatically. */
    autoFocus?: boolean | "never";
    testId?: string;
    onClick?: React.ButtonHTMLAttributes<Element>["onClick"];
    onMouseDown?: React.ButtonHTMLAttributes<Element>["onMouseDown"];
    onMouseUp?: React.ButtonHTMLAttributes<Element>["onMouseUp"];
    onMouseEnter?: React.ButtonHTMLAttributes<Element>["onMouseEnter"];
    onMouseLeave?: React.ButtonHTMLAttributes<Element>["onMouseLeave"];
    onKeyDown?: React.ButtonHTMLAttributes<Element>["onKeyDown"];
    onFocus?: React.ButtonHTMLAttributes<Element>["onFocus"];
    onBlur?: React.ButtonHTMLAttributes<Element>["onBlur"];
    /** Options forwarded to the tooltip shown when `tooltip` is set */
    tooltipOptions?: Omit<
      React.ComponentProps<typeof Tooltip>,
      "children" | "content"
    >;
  } & RequireAtLeastOne<{
    /** Accessible name; required when there is no label or tooltip. */
    "aria-label"?: string;
    /** Tooltip shown on hover/focus; also names icon-only buttons */
    tooltip?: string;
    /** The button's label */
    children?: React.ReactNode;
  }> &
    React.AriaAttributes;

/** We support 2 apis for button icons, a simple api that maps directly to icon names
 * or a more customizable api for more complex use cases */
type ButtonIconProps = ExclusifyUnion<
  | {
      /** Optional icon to display */
      iconName?: IconName;
      /** Which side of the label the icon is rendered on. */
      iconPosition?: "left" | "right";
    }
  | {
      /** Element rendered at the start of the button. */
      prefix?: React.ReactNode;
      /** Element rendered at the end of the button. */
      suffix?: React.ReactNode;
    }
>;

type ButtonElementOnlyProps = {
  /** The native button `type`. Unlike a native `<button>`, it only submits forms when explicitly set to `submit`. */
  type?: "button" | "submit" | "reset";
  href?: never;
  target?: never;
  download?: never;
  ref?: React.Ref<HTMLButtonElement>;
  onClick?: React.ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
};

export type AnchorElementOnlyProps = {
  /** Renders the button as an anchor that navigates to this URL */
  href: string;
  /** Opens the link in a new tab */
  target?: "_blank";
  /** Whether to download the linked resource instead of navigating. */
  download?: boolean;
  type?: never;
  ref?: React.Ref<HTMLAnchorElement>;
};

export type ButtonElementProps = ButtonElementOnlyProps &
  SharedButtonProps<HTMLButtonElement> &
  ButtonIconProps;
export type AnchorElementProps = AnchorElementOnlyProps &
  SharedButtonProps<HTMLAnchorElement> &
  ButtonIconProps;
export type ButtonProps = ButtonElementProps | AnchorElementProps;

const loadingSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
  lg: "md",
};

export const Button = (props: ButtonProps) => {
  const {
    className,
    variant,
    tone,
    size,
    shape = "default",
    loading,
    pressed,
    disabled,
    tooltip,
    children,
    iconName,
    iconPosition = "left",
    prefix,
    suffix,
    ref,
    href,
    onClick,
    onMouseDown,
    onMouseUp,
    onMouseEnter,
    onMouseLeave,
    onKeyDown,
    onFocus,
    onBlur,
    tabIndex,
    autoFocus,
    testId,
    tooltipOptions,
    ...rest
  } = props;

  const prefixHasIcon = !!prefix || (iconPosition === "left" && !!iconName);
  const suffixHasIcon = !!suffix || (iconPosition === "right" && !!iconName);

  const hasIcon = prefixHasIcon || suffixHasIcon;
  const isIconOnly =
    ((suffixHasIcon && !prefixHasIcon) || (prefixHasIcon && !suffixHasIcon)) &&
    !children;
  const triggerPressed = useContext(TriggerPressedContext);

  const classes = styles({
    size,
    variant,
    shape,
    tone,
    isLoading: loading,
    isDisabled: disabled || loading,
    isPressed: !!pressed || !!rest["aria-pressed"] || triggerPressed,
    hasIcon,
    hasIconLeft: prefixHasIcon,
    hasIconRight: suffixHasIcon,
    isIconOnly,
  });

  const iconElement = iconName ? (
    <Icon
      name={iconName}
      size={iconSizeMap[size ?? "md"]}
      className={classes.icon}
    />
  ) : null;
  const prefixContent =
    prefix ?? (iconPosition === "left" ? iconElement : null);
  const suffixContent =
    suffix ?? (iconPosition === "right" ? iconElement : null);

  let content = (
    // Adds a zero-width space before suffix/prefix content so that even when there is no text alignment and height stay consistent
    <>
      {prefixContent ? "\u200B" : null}
      {prefixContent}
      {hasIcon && children ? (
        <span className={classes.iconText}>{children}</span>
      ) : (
        children
      )}
      {suffixContent ? "\u200B" : null}
      {suffixContent}
    </>
  );

  if (loading) {
    content = (
      <>
        <span className={classes.loadingContainer}>
          <LoadingSpinner
            size={loadingSizeMap[size ?? "md"]}
            variant="bars"
            className={classes.loadingSpinner}
          />
        </span>
        <span className={classes.loadingContent}>{content}</span>
      </>
    );
  }

  const sharedProps = {
    className: cx(classes.button, className),
    tabIndex,
    // Exposes the resolved variant so containers (e.g. ButtonGroup) can style
    // based on a child's variant. Mirrors the recipe's `solid` default.
    "data-variant": variant ?? "solid",
    "aria-busy": loading,
    "aria-live": loading ? ("polite" as const) : undefined,
    "aria-disabled": disabled || loading || undefined,
    "data-testid": testId,
    ...rest,
    ...resolveAutoFocusProps(autoFocus),
  };

  // We split this out so that we can type the events properly
  const sharedEventHandlers = {
    onClick,
    onMouseDown,
    onMouseUp,
    onMouseEnter,
    onMouseLeave,
    onKeyDown,
    onFocus,
    onBlur,
  };

  let element: React.ReactElement;

  if ("href" in props) {
    const isInactive = disabled || loading;

    element = (
      <a
        {...sharedProps}
        {...(isInactive
          ? {}
          : (sharedEventHandlers as React.DOMAttributes<HTMLAnchorElement>))}
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={isInactive ? undefined : href}
        role={isInactive ? "link" : undefined}
        target={isInactive ? undefined : props.target}
        download={isInactive ? undefined : props.download || undefined}
        tabIndex={isInactive ? -1 : props.tabIndex}
        aria-label={props["aria-label"] ?? (!children ? tooltip : undefined)}
        draggable={false}
      >
        {content}
      </a>
    );
  } else {
    element = (
      <button
        {...sharedProps}
        {...(sharedEventHandlers as React.DOMAttributes<HTMLButtonElement>)}
        ref={ref as React.Ref<HTMLButtonElement>}
        type={(props as ButtonElementOnlyProps).type ?? "button"}
        disabled={disabled || loading}
        aria-label={props["aria-label"] ?? (!children ? tooltip : undefined)}
      >
        {content}
      </button>
    );
  }

  if (tooltip) {
    return (
      <Tooltip {...tooltipOptions} content={tooltip}>
        {element}
      </Tooltip>
    );
  }

  return element;
};

Button.displayName = "Button";
