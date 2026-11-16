import { Portal } from "@ark-ui/react/portal";
import {
  createToaster,
  Toast as ArkToast,
  Toaster as ArkToaster,
  type CreateToasterReturn,
  type ToastPlacement,
} from "@ark-ui/react/toast";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { Icon } from "../Icon/icon";
import { styles } from "./toast.recipe";
import {
  ToasterContext,
  ToastToneContext,
  useToasterContext,
} from "./toaster-context";

import type { ToastEntry, ToasterContextValue } from "./toaster-context";

/**
 * Blocks zag's Escape-to-dismiss for `shouldCloseOn="none"` toasts: zag's own
 * keydown handler on the toast root bails when the event is already
 * `defaultPrevented`, and this capture-phase handler runs first.
 */
const blockEscapeDismiss = (event: React.KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
  }
};

/**
 * Content at most this tall (px) renders as a single line — one ~22px text
 * line, or one 28px title-and-actions row — and centers the close trigger on
 * it; two text lines measure upwards of 42px.
 */
const singleLineMaxHeight = 32;

/** How many toasts a collapsed stack shows; the rest hide until it expands. */
const collapsedStackSize = 3;

/** Hard cap on mounted toasts per region; further toasts queue until space frees. */
const maxMountedToasts = 100;

const ToastContent = ({
  id,
  store,
}: {
  id: string;
  store: CreateToasterReturn;
}) => {
  const { subscribeEntries, getEntry } = useToasterContext();
  const entry = useSyncExternalStore(subscribeEntries, () => getEntry(id));
  // The toast's position in its stack (0 = frontmost); beyond the collapsed
  // deck it is marked for the recipe to hide until the stack expands.
  const stackIndex = useSyncExternalStore(store.subscribe, () =>
    store.getVisibleToasts().findIndex((toast) => toast.id === id),
  );
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [singleLine, setSingleLine] = useState(false);
  const hasEntry = entry !== undefined;

  // Measured (rather than derived from the composition) because any of the
  // parts can wrap onto further lines.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setSingleLine(content.offsetHeight <= singleLineMaxHeight);
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [hasEntry]);

  if (!entry) {
    return null;
  }

  const classes = styles({
    tone: entry.tone,
    variant: entry.variant,
    withPadding: entry.withPadding,
  });

  return (
    <ArkToast.Root
      className={cx(classes.root, entry.className)}
      data-deck-hidden={stackIndex >= collapsedStackSize ? "" : undefined}
      onKeyDownCapture={entry.closeOnEscape ? undefined : blockEscapeDismiss}
    >
      <div ref={contentRef} className={classes.content}>
        <ToastToneContext.Provider value={entry.tone}>
          {entry.content}
        </ToastToneContext.Provider>
      </div>
      {entry.renderCloseButton && (
        <ArkToast.CloseTrigger
          className={classes.closeTrigger}
          data-single-line={singleLine ? "" : undefined}
          aria-label="Dismiss notification"
        >
          <Icon name="close" size="sm" />
        </ArkToast.CloseTrigger>
      )}
    </ArkToast.Root>
  );
};

export type ToasterProps = {
  /** The subtree from which `Toast`s can be rendered. */
  children?: React.ReactNode;
  /**
   * The accessible name for each toast region, announced together with its
   * placement and focus hotkey.
   */
  label?: string;
};

type ToastRegion = {
  placement: ToastPlacement;
  store: CreateToasterReturn;
};

/**
 * One region's scroll shell: a full-viewport, pointer-transparent scroll
 * container around zag's fixed group. Its `transform` makes it the group's
 * containing block, so the group scrolls as its content; the recipe's spacer
 * pseudo-element — sized by the `--column-height` measured here — gives the
 * expanded stack its scroll extent when it outgrows the viewport.
 */
const ToasterRegion = ({
  placement,
  store,
  label,
}: ToastRegion & { label?: string }) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [columnHeight, setColumnHeight] = useState(0);
  const classes = styles();

  // The expanded column's height is the largest toast offset plus that
  // toast's own height, both maintained by zag as inline vars on each root.
  // Re-measured whenever zag rewrites them (or toasts mount/unmount).
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const measure = () => {
      let height = 0;
      const roots = shell.querySelectorAll<HTMLElement>(
        "[data-scope=toast][data-part=root]",
      );
      for (const root of roots) {
        const offset = parseFloat(root.style.getPropertyValue("--offset"));
        const ownHeight = parseFloat(
          root.style.getPropertyValue("--initial-height"),
        );
        if (!Number.isNaN(offset) && !Number.isNaN(ownHeight)) {
          height = Math.max(height, offset + ownHeight);
        }
      }
      setColumnHeight(height);
    };
    const observer = new MutationObserver(measure);
    observer.observe(shell, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    measure();
    return () => {
      observer.disconnect();
    };
  }, []);

  const side = placement.split("-")[0];

  return (
    <div
      ref={shellRef}
      className={classes.shell}
      data-scope="toast"
      data-part="shell"
      data-side={side}
      style={{ "--column-height": `${columnHeight}px` } as React.CSSProperties}
    >
      <ArkToaster toaster={store} label={label} className={classes.group}>
        {(options) => <ToastContent id={options.id ?? ""} store={store} />}
      </ArkToaster>
    </div>
  );
};

/**
 * The context that renders `Toast`s. Mount it once, wrapping the part of the
 * application (usually all of it) that shows toasts; a stacking region is
 * created per `position` in use. A collapsed region shows its front three
 * toasts; hovering or focusing it expands the full stack, which scrolls when
 * taller than the viewport. At most 100 toasts are mounted per region — any
 * more wait in a queue.
 */
export const Toaster = ({ children, label }: ToasterProps) => {
  const portalContainerRef = usePortalContainerRef();
  const [regions, setRegions] = useState<ToastRegion[]>([]);
  const storesRef = useRef<Map<ToastPlacement, CreateToasterReturn>>(new Map());
  const entriesRef = useRef<Map<string, ToastEntry>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());

  const context = useMemo<ToasterContextValue>(() => {
    const emit = () => {
      for (const listener of listenersRef.current) {
        listener();
      }
    };
    return {
      getStore: (placement) => {
        let store = storesRef.current.get(placement);
        if (!store) {
          const newStore = createToaster({
            placement,
            overlap: true,
            max: maxMountedToasts,
          });
          // A store born while the window is unfocused starts paused; the
          // window focus listener below resumes it.
          if (!document.hasFocus()) {
            newStore.pause();
          }
          storesRef.current.set(placement, newStore);
          setRegions((previous) => [
            ...previous,
            { placement, store: newStore },
          ]);
          store = newStore;
        }
        return store;
      },
      setEntry: (id, entry) => {
        entriesRef.current.set(id, entry);
        emit();
      },
      removeEntry: (id) => {
        entriesRef.current.delete(id);
        emit();
      },
      subscribeEntries: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      getEntry: (id) => entriesRef.current.get(id),
    };
  }, []);

  // zag already pauses every timer while the tab is hidden (its
  // `pauseOnPageIdle` default, via `visibilitychange`), but switching to
  // another app can leave the tab visible and only fire window `blur` — pause
  // for those too. Resume mirrors zag's own guards: never while the page is
  // hidden, and not for a region the pointer or focus is still inside (those
  // resume through their own pointer-leave/blur handling).
  useEffect(() => {
    const pauseAll = () => {
      for (const store of storesRef.current.values()) {
        store.pause();
      }
    };
    const resumeAll = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      for (const [placement, store] of storesRef.current) {
        const region = document.querySelector(
          `[data-scope="toast"][data-part="group"][data-placement="${placement}"]`,
        );
        const engaged =
          region !== null &&
          (region.matches(":hover") || region.contains(document.activeElement));
        if (!engaged) {
          store.resume();
        }
      }
    };
    window.addEventListener("blur", pauseAll);
    window.addEventListener("focus", resumeAll);
    return () => {
      window.removeEventListener("blur", pauseAll);
      window.removeEventListener("focus", resumeAll);
    };
  }, []);

  return (
    <ToasterContext.Provider value={context}>
      {children}
      <Portal container={portalContainerRef}>
        {regions.map(({ placement, store }) => (
          <ToasterRegion
            key={placement}
            placement={placement}
            store={store}
            label={label}
          />
        ))}
      </Portal>
    </ToasterContext.Provider>
  );
};

// Stable name for the docs Stage code serializer under minification
Toaster.displayName = "Toaster";
