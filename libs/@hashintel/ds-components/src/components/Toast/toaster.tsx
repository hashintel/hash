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
  type CSSProperties,
  useEffect,
  useLayoutEffect,
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
  registerToasterHandle,
} from "./toaster-api";
import {
  ToasterContext,
  ToastIconSlotContext,
  ToastInstanceContext,
  ToastToneContext,
  useToasterContext,
} from "./toaster-context";

import type { ToastStatusChangeDetails } from "./toast";
import type {
  ToasterHandle,
  ToasterToastInput,
  ToastOptions,
} from "./toaster-api";
import type {
  ToastEntry,
  ToasterContextValue,
  ToastInstance,
} from "./toaster-context";

export const ToastOptionsDoc = (_props: ToastOptions): null => null;

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

const collapsedStackSize = 3;
const maxMountedToasts = 100;

/** Id source for `toaster` calls that don't bring their own. */
let nextFunctionalToastId = 0;

type FunctionalToast = {
  id: string;
  input: ToasterToastInput;
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
  const { subscribeEntries, getEntry, holdOpen } = useToasterContext();
  const entry = useSyncExternalStore(subscribeEntries, () => getEntry(id));
  // 0 = frontmost; beyond the collapsed deck the recipe hides it.
  const stackIndex = useSyncExternalStore(store.subscribe, () =>
    store.getVisibleToasts().findIndex((toast) => toast.id === id),
  );
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [singleLine, setSingleLine] = useState(false);
  const [actionsOnFirstLine, setActionsOnFirstLine] = useState(false);
  const [iconSlot, setIconSlot] = useState<HTMLDivElement | null>(null);
  const [titleOffset, setTitleOffset] = useState(0);
  const hasEntry = entry !== undefined;
  const instance = useMemo<ToastInstance>(
    () => ({ id, store, holdOpen: () => holdOpen(store, id) }),
    [id, store, holdOpen],
  );

  useEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setSingleLine(content.offsetHeight <= singleLineMaxHeight);
      const contentRect = content.getBoundingClientRect();
      // Undoes the root's `--scale`, which animates without a resize.
      const scale =
        contentRect.height > 0 && content.offsetHeight > 0
          ? contentRect.height / content.offsetHeight
          : 1;
      const offsetFromTop = (element: Element) =>
        (element.getBoundingClientRect().top - contentRect.top) / scale;
      const actions = content.querySelector(":scope > [data-toast-actions]");
      setActionsOnFirstLine(actions !== null && offsetFromTop(actions) < 1);
      const title = content.querySelector("[data-part=title]");
      setTitleOffset(title ? Math.max(0, offsetFromTop(title)) : 0);
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
    layout: entry.layout,
    withPadding: entry.withPadding,
  });

  return (
    <ArkToast.Root
      className={cx(classes.root, entry.className)}
      data-deck-hidden={stackIndex >= collapsedStackSize ? "" : undefined}
      onKeyDownCapture={entry.closeOnEscape ? undefined : blockEscapeDismiss}
    >
      {/* Lines the icon up with the title, wherever the content places it. */}
      <div
        ref={setIconSlot}
        className={classes.iconColumn}
        style={{ "--toast-title-offset": `${titleOffset}px` } as CSSProperties}
        aria-hidden="true"
      />
      <div ref={contentRef} className={classes.content}>
        <ToastInstanceContext.Provider value={instance}>
          <ToastToneContext.Provider value={entry.tone}>
            <ToastIconSlotContext.Provider value={iconSlot}>
              {entry.content}
            </ToastIconSlotContext.Provider>
          </ToastToneContext.Provider>
        </ToastInstanceContext.Provider>
      </div>
      {entry.renderCloseButton && (
        <ArkToast.CloseTrigger
          className={classes.closeTrigger}
          data-single-line={singleLine ? "" : undefined}
          data-actions-first-line={
            actionsOnFirstLine && !singleLine ? "" : undefined
          }
          data-actions-in-row={actionsOnFirstLine ? "" : undefined}
          aria-label="Dismiss notification"
        >
          <Icon name="close" size="sm" />
        </ArkToast.CloseTrigger>
      )}
    </ArkToast.Root>
  );
};

export type ToasterProps = {
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

  // Largest zag `--offset` + `--initial-height`, re-measured on every rewrite.
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

  const [side = placement] = placement.split("-");

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
  const holdsRef = useRef<
    Map<string, { count: number; duration: number | undefined }>
  >(new Map());
  // Mutable registry: filling it must not re-render.
  const [shells] = useState(() => new Map<ToastPlacement, HTMLDivElement>());

  // Mirrors `functionalToasts` ids for the handle's synchronous reads.
  const functionalIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    functionalIdsRef.current = new Set(
      functionalToasts.map((toast) => toast.id),
    );
  }, [functionalToasts]);

  // Layout effect, so children's mount `useEffect`s can already call `toaster`.
  useLayoutEffect(() => {
    const handle: ToasterHandle = {
      create: (input) => {
        const providedId = isToastElement(input) ? input.props.id : input.id;
        nextFunctionalToastId += 1;
        const id =
          providedId === undefined
            ? `toast-fn-${nextFunctionalToastId}`
            : String(providedId);
        // The id belongs to a declaratively rendered `Toast`, which owns it.
        if (entriesRef.current.has(id) && !functionalIdsRef.current.has(id)) {
          return id;
        }
        // Closing toasts (zag's untyped `message: "DISMISS"` stamp) can't update in place.
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
      update: (idInput, input) => {
        const id = String(idInput);
        setFunctionalToasts((previous) =>
          previous.map((toast) =>
            toast.id === id ? { ...toast, input } : toast,
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
        // Created this turn and not in a store yet: drop it before it appears.
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
    // Function-form updates are no-ops for removed or closing toasts.
    const updateIfOpen = (
      store: CreateToasterReturn,
      id: string,
      patch: { type?: string; duration?: number },
    ) => {
      store.update(id, (current) => ({ ...current, ...patch }));
    };
    return {
      getStore: (placement) => {
        let store = storesRef.current.get(placement);
        if (!store) {
          const newStore = createToaster({
            placement,
            overlap: true,
            max: maxMountedToasts,
            // zag's default, pinned: the recipe's exit transition fits within it.
            removeDelay: 200,
          });
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
        holdsRef.current.delete(id);
        emit();
      },
      subscribeEntries: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      getEntry: (id) => entriesRef.current.get(id),
      holdOpen: (store, id) => {
        let hold = holdsRef.current.get(id);
        if (!hold) {
          const current = store
            .getVisibleToasts()
            .find((toast) => toast.id === id);
          if (!current) {
            return () => {};
          }
          hold = { count: 0, duration: current.duration };
          holdsRef.current.set(id, hold);
          updateIfOpen(store, id, { duration: Infinity });
        }
        hold.count += 1;
        const activeHold = hold;
        let released = false;
        return () => {
          if (released) {
            return;
          }
          released = true;
          activeHold.count -= 1;
          if (
            activeHold.count === 0 &&
            holdsRef.current.get(id) === activeHold
          ) {
            holdsRef.current.delete(id);
            updateIfOpen(store, id, { duration: activeHold.duration });
          }
        };
      },
      updateOptions: (store, id, { tone, duration }) => {
        const hold = holdsRef.current.get(id);
        if (hold) {
          hold.duration = duration;
          updateIfOpen(store, id, { type: tone });
        } else {
          updateIfOpen(store, id, { type: tone, duration });
        }
      },
    };
  }, []);

  // Pauses on app switches (zag only handles hidden tabs); iframe focus keeps `hasFocus()`.
  useEffect(() => {
    let pendingBlur: ReturnType<typeof setTimeout> | undefined;
    const pauseAll = () => {
      clearTimeout(pendingBlur);
      pendingBlur = setTimeout(() => {
        if (document.hasFocus()) {
          return;
        }
        for (const store of storesRef.current.values()) {
          store.pause();
        }
      });
    };
    const resumeAll = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      for (const [placement, store] of storesRef.current) {
        // Scoped to this Toaster's shell, not the document.
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
      clearTimeout(pendingBlur);
      window.removeEventListener("blur", pauseAll);
      window.removeEventListener("focus", resumeAll);
    };
  }, [shells]);

  return (
    <ToasterContext.Provider value={context}>
      {children}
      {functionalToasts.map(({ id, input, generation }) => {
        const sourceStatusChange = isToastElement(input)
          ? input.props.onStatusChange
          : input.onStatusChange;
        return cloneElement(buildToastElement(input, id), {
          key: `${id}:${generation}`,
          onStatusChange: (details: ToastStatusChangeDetails) => {
            if (details.status === "exit") {
              // Generation-guarded so a same-id replacement survives.
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
