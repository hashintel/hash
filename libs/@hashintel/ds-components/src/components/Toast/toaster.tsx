import { Portal } from "@ark-ui/react/portal";
import {
  createToaster,
  Toast as ArkToast,
  Toaster as ArkToaster,
  type CreateToasterReturn,
  type ToastPlacement,
} from "@ark-ui/react/toast";
import {
  cloneElement,
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
  buildToastElement,
  isToastElement,
  mergeToastPatch,
  registerToasterHandle,
} from "./toaster-api";
import {
  ToasterContext,
  ToastInstanceContext,
  ToastToneContext,
  useToasterContext,
} from "./toaster-context";

import type { ToastStatusChangeDetails } from "./toast";
import type {
  ToasterHandle,
  ToasterToastInput,
  ToasterToastProps,
} from "./toaster-api";
import type {
  ToastEntry,
  ToasterContextValue,
  ToastInstance,
} from "./toaster-context";

/**
 * Documentation marker for the flat props form the `toaster` functions accept:
 * every `Toast` prop except `withPadding` and `children`, plus the content
 * sections as `title`/`body`/`actions`.
 */
export const ToasterToastPropsDoc = (_props: ToasterToastProps): null => null;

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

/** Id source for `toaster` calls that don't bring their own. */
let nextFunctionalToastId = 0;

/** A toast created through the `toaster` functions rather than rendered as JSX. */
type FunctionalToast = {
  id: string;
  input: ToasterToastInput;
  /** Whether the title's icon slot shows the promise-pending spinner. */
  loading?: boolean;
  /**
   * Part of the entry's React key. A create reusing the id of a toast that is
   * still visible keeps it, updating the toast in place; reusing the id of a
   * dismissing or departed toast bumps it, remounting the `Toast` so the zag
   * toast — which ignores creates while closing — is removed and re-created.
   */
  generation: number;
};

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
  const holdsRef = useRef(0);
  const heldDurationRef = useRef<number | undefined>(undefined);
  const instance = useMemo<ToastInstance>(
    () => ({
      id,
      store,
      holdOpen: () => {
        if (holdsRef.current === 0) {
          heldDurationRef.current = store
            .getVisibleToasts()
            .find((toast) => toast.id === id)?.duration;
          store.update(id, { duration: Infinity });
        }
        holdsRef.current += 1;
        let released = false;
        return () => {
          if (released) {
            return;
          }
          released = true;
          holdsRef.current -= 1;
          if (holdsRef.current === 0) {
            store.update(id, { duration: heldDurationRef.current });
          }
        };
      },
    }),
    [id, store],
  );

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
        <ToastInstanceContext.Provider value={instance}>
          <ToastToneContext.Provider value={entry.tone}>
            {entry.content}
          </ToastToneContext.Provider>
        </ToastInstanceContext.Provider>
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
  shells,
}: ToastRegion & {
  label?: string;
  /** The owning Toaster's shell registry, for scoped region lookups. */
  shells: Map<ToastPlacement, HTMLDivElement>;
}) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [columnHeight, setColumnHeight] = useState(0);
  const classes = styles();

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    shells.set(placement, shell);
    return () => {
      shells.delete(placement);
    };
  }, [placement, shells]);

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
  const [functionalToasts, setFunctionalToasts] = useState<FunctionalToast[]>(
    [],
  );
  const storesRef = useRef<Map<ToastPlacement, CreateToasterReturn>>(new Map());
  const entriesRef = useRef<Map<string, ToastEntry>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());
  // A stable registry (not state: mutation must not re-render) the regions
  // fill in, read back by the focus-resume effect below.
  const [shells] = useState(() => new Map<ToastPlacement, HTMLDivElement>());

  // Mirrors `functionalToasts` ids for the handle's synchronous reads.
  const functionalIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    functionalIdsRef.current = new Set(
      functionalToasts.map((toast) => toast.id),
    );
  }, [functionalToasts]);

  // The `toaster` functions dispatch to the latest mounted Toaster. Their
  // toasts render below as regular `Toast` elements — one pipeline for both
  // APIs — and remove themselves from this list after they exit.
  useEffect(() => {
    const handle: ToasterHandle = {
      create: (input, options) => {
        const providedId = isToastElement(input) ? input.props.id : input.id;
        nextFunctionalToastId += 1;
        const id =
          providedId === undefined
            ? `toast-fn-${nextFunctionalToastId}`
            : String(providedId);
        // An entry without a functional record means the id belongs to a
        // declaratively rendered `Toast`; a second controller would fight the
        // mounted element (and take its toast down on exit), so refuse.
        if (entriesRef.current.has(id) && !functionalIdsRef.current.has(id)) {
          return id;
        }
        // In-place update is only possible while the zag toast is fully
        // visible: `isVisible` stays true during the exit, so closing toasts
        // — which zag stamps with `message: "DISMISS"` (untyped) and ignores
        // creates for — are detected through that stamp.
        const updatableInPlace = [...storesRef.current.values()].some(
          (store) =>
            store.isVisible(id) &&
            store
              .getVisibleToasts()
              .some(
                (toast) =>
                  toast.id === id &&
                  (toast as { message?: string }).message !== "DISMISS",
              ),
        );
        setFunctionalToasts((previous) => {
          const existing = previous.find((toast) => toast.id === id);
          const entry: FunctionalToast = {
            id,
            input,
            loading: options?.loading,
            generation: existing
              ? existing.generation + (updatableInPlace ? 0 : 1)
              : 0,
          };
          return existing
            ? previous.map((toast) => (toast.id === id ? entry : toast))
            : [...previous, entry];
        });
        return id;
      },
      update: (idInput, patch) => {
        const id = String(idInput);
        setFunctionalToasts((previous) =>
          previous.map((toast) =>
            toast.id === id
              ? { ...toast, input: mergeToastPatch(toast.input, patch) }
              : toast,
          ),
        );
      },
      close: (idInput) => {
        const id = String(idInput);
        let known = false;
        for (const store of storesRef.current.values()) {
          if (store.isVisible(id)) {
            store.dismiss(id);
            known = true;
          } else if (store.isDismissed(id)) {
            // Already exiting; its functional entry removes itself on exit.
            known = true;
          }
        }
        // Unknown to every store: a toast created this turn hasn't reached
        // one yet, so drop its functional entry before it can appear.
        // (Visible entries stay for their exit animation instead.)
        if (!known) {
          setFunctionalToasts((previous) =>
            previous.filter((toast) => toast.id !== id),
          );
        }
      },
    };
    return registerToasterHandle(handle);
  }, []);

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
            // Explicitly zag's default: a dismissed toast unmounts after this
            // delay, and the recipe's closed-state opacity transition is
            // tuned to complete within it.
            removeDelay: 200,
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
        // Looked up through this Toaster's own shell — a document-wide query
        // could land on another Toaster's region at the same placement.
        const region =
          shells
            .get(placement)
            ?.querySelector("[data-scope=toast][data-part=group]") ?? null;
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
  }, [shells]);

  return (
    <ToasterContext.Provider value={context}>
      {children}
      {functionalToasts.map(({ id, input, loading, generation }) => {
        const sourceStatusChange = isToastElement(input)
          ? input.props.onStatusChange
          : input.onStatusChange;
        return cloneElement(buildToastElement(input, id, { loading }), {
          key: `${id}:${generation}`,
          onStatusChange: (details: ToastStatusChangeDetails) => {
            if (details.status === "exit") {
              // Guarded by generation: an exiting toast must not take a
              // same-id replacement's entry down with it.
              setFunctionalToasts((previous) =>
                previous.filter(
                  (toast) => toast.id !== id || toast.generation !== generation,
                ),
              );
            }
            sourceStatusChange?.(details);
          },
        });
      })}
      <Portal container={portalContainerRef}>
        {regions.map(({ placement, store }) => (
          <ToasterRegion
            key={placement}
            placement={placement}
            store={store}
            label={label}
            shells={shells}
          />
        ))}
      </Portal>
    </ToasterContext.Provider>
  );
};

// Stable name for the docs Stage code serializer under minification
Toaster.displayName = "Toaster";
