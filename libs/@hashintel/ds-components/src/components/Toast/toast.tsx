import { Toast as ArkToast, useToastContext } from "@ark-ui/react/toast";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cx } from "@hashintel/ds-helpers/css";

import { defaultToneIcon } from "../../util/default-tone-icon";
import { Button, type ButtonProps } from "../Button/button";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { styles, type ToastLayout, type ToastVariant } from "./toast.recipe";
import {
  ToastIconSlotContext,
  ToastInstanceContext,
  ToastToneContext,
  useToasterContext,
} from "./toaster-context";

import type { Tone } from "../../util/form-shared";
import type { Position } from "../Tooltip/base-tooltip";
import type { ToastPlacement } from "@ark-ui/react/toast";
import type { ExclusifyUnion } from "type-fest";

export type ToastShouldCloseOn = "closeButton" | "none";

/**
 * A lifecycle status: `enter` when the toast
 * becomes visible, `behind` when a newer toast pushes it behind the front of
 * its stack, `front` when it returns to the front, and `exit` once it has
 * fully left.
 */
export type ToastStatus = "enter" | "exit" | "behind" | "front";

export type ToastStatusChangeDetails = {
  /** The status the toast moved to. */
  status: ToastStatus;
};

export type ToastRenderDetails = {
  /** Dismisses the toast, playing its exit animation. */
  close: () => void;
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

export const ToastTitle = (props: ToastTitleProps) => {
  const { title, icon = true, loading, className, children } = props;
  const tone = useContext(ToastToneContext);
  const iconSlot = useContext(ToastIconSlotContext);
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

  const iconElement = iconNode ? (
    <span className={classes.icon} aria-hidden="true">
      {iconNode}
    </span>
  ) : null;

  return (
    <div className={cx(classes.titleRow, className)}>
      {iconSlot === undefined
        ? iconElement
        : iconSlot && iconElement && createPortal(iconElement, iconSlot)}
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
  /** Whether activating the action also dismisses the toast. */
  closeToast?: boolean;
  /**
   * Called when the action is activated. With `closeToast`, a returned
   * promise defers the dismissal until it resolves.
   */
  onClick?: (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void | Promise<unknown>;
};

type ToastActionButtonProps = Omit<ToastActionProps, "closeToast">;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

const ToastActionButton = ({
  variant,
  size,
  className,
  ...props
}: ToastActionButtonProps) => (
  <Button
    {...(props as ButtonProps)}
    size={size ?? "sm"}
    variant={variant ?? "subtle"}
    className={cx(
      variant === undefined ? "toast-action-button" : undefined,
      className,
    )}
  />
);

const ClosingToastAction = ({
  onClick,
  loading,
  ...props
}: ToastActionButtonProps) => {
  const toast = useToastContext();
  const instance = useContext(ToastInstanceContext);
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Duration-based, since pointer-leave resumes zag's timers over any `pause()`.
  const holdOpen = (): (() => void) => {
    if (!instance) {
      // Without the toaster's instance handle (plain Ark context): best effort.
      toast.pause();
      return () => {
        toast.resume();
      };
    }
    return instance.holdOpen();
  };

  const handleClick: (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void | Promise<unknown> = (event) => {
    const result = onClick?.(event);
    if (!isThenable(result) || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    setPending(true);
    const release = holdOpen();
    result.then(
      () => {
        // The loading state intentionally persists through the exit.
        toast.dismiss();
      },
      () => {
        release();
        if (mountedRef.current) {
          setPending(false);
        }
      },
    );
  };

  return (
    <ArkToast.ActionTrigger asChild>
      <ToastActionButton
        {...props}
        loading={pending || loading}
        onClick={handleClick}
      />
    </ArkToast.ActionTrigger>
  );
};

export const ToastAction = ({ closeToast, ...props }: ToastActionProps) => {
  if (closeToast) {
    return <ClosingToastAction {...props} />;
  }
  return <ToastActionButton {...props} />;
};

export const ToastActions = ({ actions }: ToastActionsProps) => {
  const classes = styles();
  if (!actions) {
    return null;
  }
  // Lets the root recipe restyle these buttons on solid fills.
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
   * Set to `singleLine` to force the toast to try and fit all of the title and actions onto a single line
   * even if it requires widening the toast message. singleLine will still break onto multiple lines
   * on small screens. `auto` will also render on a single line if the content is short enough.
   */
  layout?: ToastLayout;
  /**
   * The viewport edge or corner the toast stacks at. `left`/`right` positions
   * map onto the nearest corner: `-start` the top one, `-end` the bottom one.
   */
  position?: Position;
  /**
   * The toast's content: `Toast.Title`, `Toast.Body`, and `Toast.Actions` in
   * that order (each optional), or any custom node — pair custom content with
   * `withPadding={false}` for an edge-to-edge layout. The function form
   * receives `close` for custom content that dismisses its own toast.
   */
  children:
    | React.ReactNode
    | ((details: ToastRenderDetails) => React.ReactNode);
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
  layout = "auto",
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

  const close = useCallback(() => {
    toasterContext.getStore(placement).dismiss(toastId);
  }, [placement, toastId, toasterContext]);
  const content =
    typeof children === "function" ? children({ close }) : children;

  // Read at creation so options stay fresh without re-creating the zag toast.
  const latestRef = useRef({ tone, duration, onStatusChange });
  useEffect(() => {
    latestRef.current = { tone, duration, onStatusChange };
  });

  // Content and presentation bypass the zag store entirely (see ToastEntry).
  useEffect(() => {
    toasterContext.setEntry(toastId, {
      content,
      className,
      tone,
      variant,
      layout,
      withPadding,
      renderCloseButton: shouldCloseOn === "closeButton",
      closeOnEscape: shouldCloseOn !== "none",
    });
  });

  useEffect(() => {
    const store = toasterContext.getStore(placement);
    let cancelled = false;
    let exiting = false;
    // New toasts are born at the front of their stack.
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
    // Deferred: zag publishes with flushSync, which React forbids inside effects.
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      store.create({
        id: toastId,
        // The zag type drives default duration and queue priority.
        type: latestRef.current.tone,
        duration: latestRef.current.duration,
        onStatusChange: (details) => {
          if (cancelled) {
            return;
          }
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
      // remove, not dismiss: zag ignores creates for a closing id, breaking remounts.
      queueMicrotask(() => {
        store.remove(toastId);
      });
      toasterContext.removeEntry(toastId);
    };
  }, [toastId, placement, toasterContext]);

  // Re-derives the default lifetime, not queue priority (fixed at creation).
  const previousOptionsRef = useRef({ tone, duration });
  useEffect(() => {
    const previous = previousOptionsRef.current;
    if (previous.tone === tone && previous.duration === duration) {
      return;
    }
    previousOptionsRef.current = { tone, duration };
    const store = toasterContext.getStore(placement);
    queueMicrotask(() => {
      toasterContext.updateOptions(store, toastId, { tone, duration });
    });
  }, [tone, duration, placement, toastId, toasterContext]);

  return null;
};

// Stable names for the docs code serializer under minification.
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
