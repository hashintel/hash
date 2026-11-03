import { createContext } from "react";

import type { FormInputSize } from "../../util/form-shared";

export type TabsOrientation = "horizontal" | "vertical";

export type TabsVariant = "line" | "pill" | "folder";

/** The tab size ladder — the shared form scale without its smallest step */
export type TabsSize = Exclude<FormInputSize, "xxs">;

// Provided by TabsRoot; non-null means a root is present. It carries the
// root's styling defaults down to TabList/TabContent (each can override), and
// since the ark machine lives on the root while the list owns the effective
// orientation, the list registers that back here.
export const TabsRootContext = createContext<{
  variant?: TabsVariant;
  orientation?: TabsOrientation;
  size?: TabsSize;
  registerOrientation: (orientation: TabsOrientation) => void;
} | null>(null);
