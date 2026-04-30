/* eslint-disable react/destructuring-assignment, react/button-has-type, @typescript-eslint/prefer-nullish-coalescing */
import { cx } from "@hashintel/ds-helpers/css";
import type { ExclusifyUnion, RequireAtLeastOne } from "type-fest";

import type { FormInputSize } from "../../util/form-shared";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { styles } from "./button.recipe";

export type Variant = "solid" | "subtle" | "ghost" | "link" | "linkSubtle";
export type Tone = "neutral" | "brand" | "error"; // success, warning, etc

type SharedButtonProps<Element extends HTMLButtonElement | HTMLAnchorElement> =
  {
    className?: string;
    /** The overall style of the button */
    variant?: Variant;
    /** Sets the color treatment of the button for destructive actions. */
    tone?: Tone;
    /** The size (height) of the button */
    size?: FormInputSize;
    /** The shape of the button. Non default shapes should VERY rarely be used */
    shape?: "default" | "round";
    /** Whether the button is in a loading state */
    loading?: boolean;
    /** Whether the button is in a pressed/active state */
    pressed?: boolean;
    disabled?: boolean;
    tabIndex?: number;
    onClick?: React.ButtonHTMLAttributes<Element>["onClick"];
    onMouseDown?: React.ButtonHTMLAttributes<Element>["onMouseDown"];
    onMouseUp?: React.ButtonHTMLAttributes<Element>["onMouseUp"];
    onMouseEnter?: React.ButtonHTMLAttributes<Element>["onMouseEnter"];
    onMouseLeave?: React.ButtonHTMLAttributes<Element>["onMouseLeave"];
    onKeyDown?: React.ButtonHTMLAttributes<Element>["onKeyDown"];
    onFocus?: React.ButtonHTMLAttributes<Element>["onFocus"];
    onBlur?: React.ButtonHTMLAttributes<Element>["onBlur"];
  } & RequireAtLeastOne<{
    tooltip?: string;
    children?: React.ReactNode;
  }> &
    React.AriaAttributes;

/** We support 2 apis for button icons, a simple api that maps directly to icon names
 * or a more customizable api for more complex use cases */
type ButtonIconProps = ExclusifyUnion<
  | {
      /** Optional icon to display */
      iconName?: IconName;
      /** Whether the icon should be on the left or right */
      iconPosition?: "left" | "right";
    }
  | {
      /** Optional element to include at the beginning of a button */
      prefix?: React.ReactNode;
      /** Optional element to include at the end of a button */
      suffix?: React.ReactNode;
    }
>;

type ButtonElementOnlyProps = {
  /** Button type - defaults to "button" */
  type?: "button" | "submit" | "reset";
  href?: never;
  target?: never;
  download?: never;
  ref?: React.Ref<HTMLButtonElement>;
} & RequireAtLeastOne<{
  onClick: React.ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  type: "submit" | "reset";
}>;

export type AnchorElementOnlyProps = {
  href: string;
  target?: "_blank";
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

const iconSizeMap: Record<FormInputSize, FormInputSize> = {
  xs: "sm",
  sm: "sm",
  md: "md",
  lg: "md",
};

const loadingSizeMap: Record<FormInputSize, FormInputSize> = {
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
    href,
    onClick,
    onMouseDown,
    onMouseUp,
    onMouseEnter,
    onMouseLeave,
    onKeyDown,
    onFocus,
    onBlur,
    ...rest
  } = props;

  const iconElement = iconName ? (
    <Icon name={iconName} size={iconSizeMap[size ?? "md"]} />
  ) : null;
  const prefixContent =
    prefix ?? (iconPosition === "left" ? iconElement : null);
  const suffixContent =
    suffix ?? (iconPosition === "right" ? iconElement : null);

  const hasIcon = !!suffixContent || !!prefixContent;
  const isIconOnly = hasIcon && !children;

  const classes = styles({
    size,
    variant,
    shape,
    tone,
    isLoading: loading,
    isDisabled: disabled || loading,
    isPressed: pressed,
    hasIcon,
    hasIconLeft: !!prefixContent,
    hasIconRight: !!suffixContent,
    isIconOnly,
  });

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
          <LoadingSpinner size={loadingSizeMap[size ?? "md"]} variant="bars" />
        </span>
        <span className={classes.loadingContent}>{content}</span>
      </>
    );
  }

  const sharedProps = {
    className: cx(classes.button, className),
    title: tooltip,
    "aria-pressed": pressed,
    "aria-busy": loading,
    "aria-live": loading ? ("polite" as const) : undefined,
    "aria-disabled": disabled || loading || undefined,
    ...rest,
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

  if ("href" in props) {
    return (
      <a
        {...sharedProps}
        {...(sharedEventHandlers as React.DOMAttributes<HTMLAnchorElement>)}
        ref={(props as AnchorElementOnlyProps).ref}
        href={href}
        target={props.target}
        download={props.download || undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      {...sharedProps}
      {...(sharedEventHandlers as React.DOMAttributes<HTMLButtonElement>)}
      ref={(props as ButtonElementOnlyProps).ref}
      type={(props as ButtonElementOnlyProps).type ?? "button"}
      disabled={disabled || loading}
    >
      {content}
    </button>
  );
};
