/**
 * this component should be rendered with glide-data-grid
 * glide-data-grid uses this to show editing overlays
 */
export const GlideGridOverlayPortal = () => {
  return (
    <div
      id="portal"
      style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }}
    />
  );
};
