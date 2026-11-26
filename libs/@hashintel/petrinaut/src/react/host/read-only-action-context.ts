import { createContext } from "react";

/**
 * Offered with the notice that explains a blocked edit on a document the host
 * made read-only, e.g. saving an editable copy.
 */
export type ReadOnlyAction = { label: string; onClick: () => void };

/**
 * The host's {@link ReadOnlyAction}, or that of the first running plugin
 * that declares one.
 *
 * It has a context of its own because every component that can edit reads it,
 * through the commands and the mutations. The rest of net management may
 * change on every edit, and must not render those components.
 */
export const ReadOnlyActionContext = createContext<ReadOnlyAction | undefined>(
  undefined,
);
