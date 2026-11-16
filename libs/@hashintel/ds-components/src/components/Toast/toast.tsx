import { Toast as ArkToast } from "@ark-ui/react/toast";
import { useContext, useEffect, useId, useRef } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { defaultToneIcon } from "../../util/default-tone-icon";
import { Button, type ButtonProps } from "../Button/button";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { styles, type ToastVariant } from "./toast.recipe";
import { ToastToneContext, useToasterContext } from "./toaster-context";

import type { Tone } from "../../util/form-shared";
import type { Position } from "../Tooltip/base-tooltip";
import type { ToastPlacement } from "@ark-ui/react/toast";
import type { ExclusifyUnion } from "type-fest";

export type ToastShouldCloseOn = "closeButton" | "none";

/**
 * A lifecycle status reported through `onStatusChange`: `enter` when the toast
 * becomes visible, `behind` when a newer toast pushes it behind the front of
 * its stack, `front` when it returns to the front, and `exit` once it has
 * fully left.
 */
export type ToastStatus = "enter" | "exit" | "behind" | "front";

export type ToastStatusChangeDetails = {
  /** The status the toast moved to. */
  status: ToastStatus;
};

export type ToastTitleProps = ExclusifyUnion<
  | {
      /** The toast's heading. */
      title?: React.ReactNode;
      /**
       * The leading icon: `true` for the tone's default icon, `false` for
       * none, a named design-system icon, or arbitrary custom content.
       * Ignored while `loading` is set.
       */
      icon?: boolean | { iconName: IconName } | { custom: React.ReactNode };
      /** Whether to show a spinner in the icon slot. */
      loading?: boolean;
      className?: string;
    }
  | {
      /** Custom title-row content, replacing the structured title layout. */
      children?: React.ReactNode;
      className?: string;
    }
>;

export type ToastBodyProps = {
  /** The toast's main message. */
  children: React.ReactNode;
  className?: string;
};

export type ToastActionsProps = {
  /** The action buttons for responding to the toast. */
  actions?: React.ReactNode;
};

const renderIcon = (
  icon: boolean | { iconName: IconName } | { custom: React.ReactNode },
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

// The parts are exported (beyond the `Toast.*` members) so react-docgen picks
// up their props for the published docs tables.
export const ToastTitle = (props: ToastTitleProps) => {
  const { title, icon = true, loading, className, children } = props;
  // The tone lives on the `Toast` root; the toaster provides it where the
  // content renders so `icon`'s tone default can resolve here.
  const tone = useContext(ToastToneContext);
  const classes = styles({ tone });

  if (children !== undefined) {
    return (
      <ArkToast.Title className={cx(classes.titleRow, className)}>
        {children}
      </ArkToast.Title>
    );
  }

  const iconNode = loading ? (
    <LoadingSpinner size="sm" />
  ) : (
    renderIcon(icon, tone, classes)
  );

  return (
    <div className={cx(classes.titleRow, className)}>
      {iconNode && (
        <span className={classes.icon} aria-hidden="true">
          {iconNode}
        </span>
      )}
      <ArkToast.Title className={classes.title}>{title}</ArkToast.Title>
    </div>
  );
};

export const ToastBody = ({ children, className }: ToastBodyProps) => {
  const classes = styles();
  return (
    <ArkToast.Description className={cx(classes.body, className)}>
      {children}
    </ArkToast.Description>
  );
};

export type ToastActionProps = ButtonProps & {
  /**
   * Whether activating the action also dismisses the toast.
   * `event.preventDefault()` in `onClick` cancels the dismissal.
   */
  closeToast?: boolean;
};

/**
 * An action button for a toast's `Toast.Actions` row. Takes the same props as
 * `Button`, defaulting to the compact treatment (`size="sm"`,
 * `variant="subtle"`). Subtle actions are tagged with the
 * `toast-action-button` class so the `soft` and `solid` toast variants can
 * lift them onto a white background that reads on their fills.
 */
export const ToastAction = ({
  variant,
  className,
  closeToast,
  ...props
}: ToastActionProps) => {
  const button = (
    <Button
      size="sm"
      {...props}
      variant={variant ?? "subtle"}
      className={cx(
        (variant ?? "subtle") === "subtle" ? "toast-action-button" : undefined,
        className,
      )}
    />
  );
  if (!closeToast) {
    return button;
  }
  // zag's action trigger runs the composed click (consumer handler first) and
  // dismisses through the store unless the event was defaultPrevented.
  return <ArkToast.ActionTrigger asChild>{button}</ArkToast.ActionTrigger>;
};

export const ToastActions = ({ actions }: ToastActionsProps) => {
  const classes = styles();
  if (!actions) {
    return null;
  }
  // data-toast-actions scopes the region so the root recipe can restyle the
  // buttons within it on solid fills.
  return (
    <div data-toast-actions className={classes.actions}>
      {actions}
    </div>
  );
};

/**
 * Where a toast appears. `left`/`right` positions map onto the nearest
 * stacking corner (`-start` meaning the top one, `-end` the bottom one).
 */
const placementForPosition: Record<Position, ToastPlacement> = {
  top: "top",
  "top-start": "top-start",
  "top-end": "top-end",
  bottom: "bottom",
  "bottom-start": "bottom-start",
  "bottom-end": "bottom-end",
  left: "bottom-start",
  "left-start": "top-start",
  "left-end": "bottom-start",
  right: "bottom-end",
  "right-start": "top-end",
  "right-end": "bottom-end",
};

export type ToastProps = {
  /** The toast's unique id. Toasts rendered with the same id update the same toast in place. */
  id?: string | number;
  className?: string;
  /** Whether the toast pads its content. Disable for edge-to-edge custom content. */
  withPadding?: boolean;
  /** The color treatment of the toast. Also sets its auto-dismiss priority and default `duration`. */
  tone?: Tone;
  /**
   * `solid` fills with the saturated tone and contrast text; `soft` tints the
   * surface; `outline` draws a border on an opaque, page-colored background.
   */
  variant?: ToastVariant;
  /**
   * The viewport edge or corner the toast stacks at. `left`/`right` positions
   * map onto the nearest corner: `-start` the top one, `-end` the bottom one.
   */
  position?: Position;
  /**
   * The toast's content: `Toast.Title`, `Toast.Body`, and `Toast.Actions` in
   * that order (each optional), or any custom node — pair custom content with
   * `withPadding={false}` for an edge-to-edge layout.
   */
  children: React.ReactNode;
  /**
   * Which dismissals the toast offers: `closeButton` renders a close button
   * and dismisses on Escape while focused; `none` renders neither, leaving
   * dismissal to `duration`, unmounting, or a `closeToast` action.
   */
  shouldCloseOn?: ToastShouldCloseOn;
  /**
   * Called as the toast moves through its lifecycle: `enter` when it becomes
   * visible, `behind` when a newer toast pushes it behind the front of its
   * stack, `front` when it returns to the front, and `exit` once it has
   * fully left. Remove the `Toast` element on `exit`.
   */
  onStatusChange?: (details: ToastStatusChangeDetails) => void;
  /**
   * How long the toast stays visible, in milliseconds. `Infinity` keeps it
   * until it is dismissed; when omitted, the lifetime depends on `tone`.
   */
  duration?: number;
};

export const ToastRoot = ({
  id,
  className,
  withPadding = true,
  tone = "neutral",
  variant = "soft",
  position = "bottom-end",
  children,
  shouldCloseOn = "closeButton",
  onStatusChange,
  duration,
}: ToastProps) => {
  const toasterContext = useToasterContext();
  const autoId = useId();
  const toastId = id === undefined ? autoId : String(id);
  const placement = placementForPosition[position];

  // The zag toast is created once per id/placement; everything that may change
  // on a later render is read through this ref so creation options stay fresh
  // without re-creating (and updates never restart the dismiss timer).
  const latestRef = useRef({ tone, duration, onStatusChange });
  useEffect(() => {
    latestRef.current = { tone, duration, onStatusChange };
  });

  // Content and presentation bypass the zag store entirely (see ToastEntry).
  useEffect(() => {
    toasterContext.setEntry(toastId, {
      content: children,
      className,
      tone,
      variant,
      withPadding,
      renderCloseButton: shouldCloseOn === "closeButton",
      closeOnEscape: shouldCloseOn !== "none",
    });
  });

  useEffect(() => {
    const store = toasterContext.getStore(placement);
    let cancelled = false;
    let exiting = false;
    // New toasts are born at the front of their stack; the store subscription
    // below reports `behind`/`front` as newer toasts push this one back and
    // dismissals return it to the front.
    let wasFrontmost = true;
    const unsubscribe = store.subscribe(() => {
      if (exiting) {
        return;
      }
      const index = store
        .getVisibleToasts()
        .findIndex((toast) => toast.id === toastId);
      if (index === -1) {
        return;
      }
      const frontmost = index === 0;
      if (frontmost !== wasFrontmost) {
        wasFrontmost = frontmost;
        latestRef.current.onStatusChange?.({
          status: frontmost ? "front" : "behind",
        });
      }
    });
    // Store mutations are deferred to a microtask: zag publishes to its React
    // machines with flushSync, which React forbids (and logs an error for)
    // when called from inside an effect.
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      store.create({
        id: toastId,
        // The tone doubles as the zag type, driving the default duration and
        // the queue priority (errors outrank successes).
        type: latestRef.current.tone,
        duration: latestRef.current.duration,
        onStatusChange: (details) => {
          if (details.status === "visible") {
            latestRef.current.onStatusChange?.({ status: "enter" });
          } else if (details.status === "dismissing") {
            exiting = true;
          } else {
            // "unmounted": the toast has fully left the store.
            exiting = true;
            toasterContext.removeEntry(toastId);
            latestRef.current.onStatusChange?.({ status: "exit" });
          }
        },
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
      // remove, not dismiss: a dismissing toast blocks re-creation under the
      // same id (zag ignores creates targeting closing toasts), which would
      // drop the toast on an immediate remount. Exit animations still play
      // for duration/close-button dismissals; unmounting is immediate.
      queueMicrotask(() => {
        store.remove(toastId);
      });
      toasterContext.removeEntry(toastId);
    };
  }, [toastId, placement, toasterContext]);

  // Apply duration changes to an already-visible toast (restarts its timer).
  const previousDurationRef = useRef(duration);
  useEffect(() => {
    if (previousDurationRef.current === duration) {
      return;
    }
    previousDurationRef.current = duration;
    const store = toasterContext.getStore(placement);
    queueMicrotask(() => {
      store.update(toastId, { duration });
    });
  }, [duration, placement, toastId, toasterContext]);

  return null;
};

// Stable names for the docs Stage code serializer under minification; the
// dotted part names intentionally serialize transparently.
ToastRoot.displayName = "Toast";
ToastTitle.displayName = "Toast.Title";
ToastBody.displayName = "Toast.Body";
ToastActions.displayName = "Toast.Actions";
ToastAction.displayName = "Toast.Action";

export const Toast = Object.assign(ToastRoot, {
  Title: ToastTitle,
  Body: ToastBody,
  Actions: ToastActions,
  Action: ToastAction,
});
