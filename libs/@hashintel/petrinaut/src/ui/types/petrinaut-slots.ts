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
  /**
   * Rendered in the top bar's leading section, after the built-in
   * sidebar-toggle and burger-menu buttons and immediately before the net
   * title (when shown) — e.g. for host breadcrumbs leading up to the title.
   */
  topBarStart?: React.ReactNode;
  /**
   * Rendered at the trailing edge of the top bar, after the built-in
   * running-experiments popover and version-history button.
   */
  topBarEnd?: React.ReactNode;
  /**
   * Inline style applied to the net-title input in the top bar (when the
   * title is shown). Lets hosts blend the title into adjacent slot content
   * — e.g. tint it as the final crumb of `topBarStart` breadcrumbs —
   * without competing with the editor's own styles.
   */
  titleStyle?: React.CSSProperties;
};
