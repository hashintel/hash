/**
 * Slots into which the host can inject component at specific locations
 *
 * Slots accept a bare `ReactNode` so the host has full control over what
 * renders — the library renders the node verbatim and applies no styling.
 * Hosts that want visual consistency with the rest of the editor can
 * import from `@hashintel/ds-components` (e.g. Button).
 *
 * Slot content is rendered inside the editor's Panda CSS context. Hosts
 * using a different styling system (e.g. MUI, Emotion) should ensure their
 * styles are scoped — or just use `@hashintel/ds-components` directly.
 */
export type PetrinautSlots = {
  /**
   * Rendered at the leading edge of the top bar, before the built-in
   * sidebar-toggle and burger-menu buttons.
   */
  topBarStart?: React.ReactNode;
  /**
   * Rendered at the trailing edge of the top bar, after the built-in
   * running-experiments popover and version-history button.
   */
  topBarEnd?: React.ReactNode;
};
