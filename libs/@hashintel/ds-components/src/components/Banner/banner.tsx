import { Children, isValidElement } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { Button, type ButtonProps } from "../Button/button";
import { Icon, type IconName } from "../Icon/icon";
import { styles } from "./banner.recipe";

import type { Tone } from "../../util/form-shared";

type BannerVariant = "solid" | "soft" | "outline";

/** The default leading icon shown when `icon` is `true`, keyed by tone. */
const defaultToneIcon: Record<Tone, IconName> = {
  neutral: "info",
  brand: "info",
  caution: "warning",
  error: "diamondExclamation",
  success: "circleCheck",
};

export type BannerRootProps = {
  className?: string;
  children: React.ReactNode;
  tone: Tone;
  /**
   * The leading icon: `true` for the tone's default icon, `false` for none, a
   * named design-system icon, or arbitrary custom content.
   */
  icon: boolean | { iconName: IconName } | { custom: React.ReactNode };
  /**
   * `solid` is a saturated tone fill with white text; `soft` tints the surface;
   * `outline` sits on an opaque surface.
   */
  variant?: BannerVariant;
  /** When present and enabled, renders a trailing dismiss button. */
  dismissible?: {
    dismissible: boolean;
    onDismiss: () => void;
  };
  /**
   * The ARIA role for the banner. Not set by default — pass e.g. `"status"`
   * (polite) or `"alert"` (assertive) to announce it to assistive technology.
   */
  role?: React.AriaRole;
} & React.AriaAttributes;

const renderIcon = (
  icon: BannerRootProps["icon"],
  tone: Tone,
  classes: ReturnType<typeof styles>,
): React.ReactNode => {
  if (!icon) {
    return null;
  }
  if (icon === true) {
    return (
      <Icon
        name={defaultToneIcon[tone]}
        size="sm"
        className={classes.defaultIcon}
      />
    );
  }
  if ("iconName" in icon) {
    return <Icon name={icon.iconName} size="sm" />;
  }
  return icon.custom;
};

export const BannerTitle = ({
  className,
  children,
  as = "h2",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "h2" | "h3" | "h4" | "h5" | "h6";
}) => {
  const { title } = styles();
  const Component = as as React.ElementType;
  return <Component className={cx(title, className)}>{children}</Component>;
};

export const BannerDescription = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  const { description } = styles();
  return <div className={cx(description, className)}>{children}</div>;
};

export const BannerActions = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  const { actions } = styles();
  // `data-banner-actions` scopes the region so the root recipe can reach the
  // default action buttons within it per variant (the solid `fill` restyles the
  // `banner-action-button`-tagged ones), since this sub-component has no variant.
  return (
    <div data-banner-actions className={cx(actions, className)}>
      {children}
    </div>
  );
};

/**
 * A trailing action button for a Banner. Takes the same props as `Button`, but
 * defaults to the banner's compact secondary treatment (`size="xs"`,
 * `variant="subtle"`, neutral tone). When the consumer leaves `variant` unset,
 * the button is tagged with the `banner-action-button` class so the solid `fill`
 * variant can restyle it to read on the fill; passing an explicit `variant` opts
 * out of that override and renders a plain Button with that variant.
 */
export const BannerActionButton = ({
  variant,
  className,
  ...props
}: ButtonProps) => (
  <Button
    size="xs"
    {...(props as ButtonProps)}
    variant={variant ?? "subtle"}
    className={cx(
      variant === undefined ? "banner-action-button" : undefined,
      className,
    )}
  />
);

export const BannerRoot = ({
  className,
  children,
  tone,
  icon,
  variant = "soft",
  dismissible,
  ...ariaAttributes
}: BannerRootProps) => {
  const isCustomIcon = typeof icon === "object" && "custom" in icon;
  const classes = styles({ tone, variant, customIcon: isCustomIcon });
  const iconNode = renderIcon(icon, tone, classes);
  const showDismiss = !!dismissible?.dismissible;

  const items = Children.toArray(children);
  const actions = items.filter(
    (child) => isValidElement(child) && child.type === BannerActions,
  );
  const body = items.filter(
    (child) => !(isValidElement(child) && child.type === BannerActions),
  );

  return (
    <div className={cx(classes.root, className)} {...ariaAttributes}>
      {iconNode && (
        <span className={classes.iconWrap} aria-hidden="true">
          {iconNode}
        </span>
      )}
      <div className={classes.content}>
        <div className={classes.message}>{body}</div>
        {actions.length > 0 && actions}
      </div>
      {showDismiss && (
        <span className={classes.dismiss}>
          <Button
            variant="linkSubtle"
            tone="neutral"
            size="md"
            iconName="close"
            aria-label="Dismiss"
            onClick={dismissible.onDismiss}
          />
        </span>
      )}
    </div>
  );
};

export const Banner = Object.assign(BannerRoot, {
  Title: BannerTitle,
  Description: BannerDescription,
  Actions: BannerActions,
  ActionButton: BannerActionButton,
});
