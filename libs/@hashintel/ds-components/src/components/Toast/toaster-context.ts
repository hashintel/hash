import { createContext, useContext } from "react";

import type { Tone } from "../../util/form-shared";
import type { ToastVariant } from "./toast.recipe";
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
};

export const ToasterContext = createContext<ToasterContextValue | null>(null);

/**
 * The tone of the toast being rendered, provided by the toaster around each
 * toast's content so `Toast.Title` can resolve its tone-default icon.
 */
export const ToastToneContext = createContext<Tone>("neutral");

export const useToasterContext = (): ToasterContextValue => {
  const context = useContext(ToasterContext);
  if (!context) {
    throw new Error("Toast must be rendered inside a Toaster");
  }
  return context;
};
