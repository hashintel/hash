import { createContext, useContext } from "react";

import type { Tone } from "../../util/form-shared";
import type { ToastLayout, ToastVariant } from "./toast.recipe";
import type { CreateToasterReturn, ToastPlacement } from "@ark-ui/react/toast";

/**
 * The presentational half of a mounted `Toast`, kept outside the zag store:
 * zag restarts a toast's dismiss timer on every update, so only lifecycle
 * options (id, duration, …) go through the store while content re-renders
 * flow through this entry map.
 */
export type ToastEntry = {
  content: React.ReactNode;
  className?: string;
  tone: Tone;
  variant: ToastVariant;
  layout: ToastLayout;
  withPadding: boolean;
  renderCloseButton: boolean;
  closeOnEscape: boolean;
};

export type ToasterContextValue = {
  /** Returns the zag store for a placement, creating it (and its region) on first use. */
  getStore: (placement: ToastPlacement) => CreateToasterReturn;
  setEntry: (id: string, entry: ToastEntry) => void;
  removeEntry: (id: string) => void;
  subscribeEntries: (listener: () => void) => () => void;
  getEntry: (id: string) => ToastEntry | undefined;
  /**
   * Holds the toast un-expirable (duration `Infinity`) until the returned
   * release is called. Holds are reference-counted per toast; the last release
   * restores the latest requested duration, restarting the timer.
   */
  holdOpen: (store: CreateToasterReturn, id: string) => () => void;
  /**
   * Applies tone and duration changes to a live toast, ignoring closed ones.
   * A duration change on a held toast is deferred until its release.
   */
  updateOptions: (
    store: CreateToasterReturn,
    id: string,
    options: { tone: Tone; duration: number | undefined },
  ) => void;
};

export const ToasterContext = createContext<ToasterContextValue | null>(null);

export const ToastToneContext = createContext<Tone>("neutral");

export type ToastInstance = {
  id: string;
  store: CreateToasterReturn;
  /** Holds the toast open; see `ToasterContextValue.holdOpen`. */
  holdOpen: () => () => void;
};

export const ToastInstanceContext = createContext<ToastInstance | null>(null);

/**
 * The toast's icon column, which `Toast.Title` portals its icon into so the
 * body and actions align with the title. `undefined` outside a toaster, where
 * the icon stays inline; `null` until the column mounts.
 */
export const ToastIconSlotContext = createContext<
  HTMLElement | null | undefined
>(undefined);

export const useToasterContext = (): ToasterContextValue => {
  const context = useContext(ToasterContext);
  if (!context) {
    throw new Error("Toast must be rendered inside a Toaster");
  }
  return context;
};
