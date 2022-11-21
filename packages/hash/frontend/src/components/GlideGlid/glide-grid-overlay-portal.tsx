/**
 * this component should be rendered with glide-data-grid
 * glide-data-grid uses this to show editing overlays
 */
export const GlideGridOverlayPortal = () => {
  return (
    <div
      id="portal"
      // keeping z-index at 999, so we can show other MUI components like tooltips etc. on grid editors.
      // all absolute MUI components have zIndex >= 1000
      style={{ position: "fixed", left: 0, top: 0, zIndex: 999 }}
    />
  );
};
