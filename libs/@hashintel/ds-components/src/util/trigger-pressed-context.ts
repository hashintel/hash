import { createContext } from "react";

/**
 * Anchor components (e.g. Menu) provide this around their trigger so the
 * trigger renders visually pressed while the anchored element is open, without
 * threading a prop through an arbitrary trigger element. Visual only —
 * consumers must not feed it into `aria-pressed`.
 */
export const TriggerPressedContext = createContext(false);
