/**
 * Slots into which the host can inject component at specific locations
 *
 * Content slots accept a bare `ReactNode` so the host has full control over
 * what renders — the library renders the node verbatim and applies no
 * styling. Hosts that want visual consistency with the rest of the editor
 * can import from `@hashintel/ds-components` (e.g. Button).
 *
 * Slot content is rendered inside the editor's Panda CSS context. Hosts
 * using a different styling system (e.g. MUI, Emotion) should ensure their
 * styles are scoped — or just use `@hashintel/ds-components` directly.
 */
export type PetrinautSlots = {
  /** Rendered after Petrinaut's built-in groups in the Labs settings section. */
  settingsLabs?: React.ReactNode;
};
