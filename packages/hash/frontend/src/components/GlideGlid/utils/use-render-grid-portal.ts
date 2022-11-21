import { useEffect } from "react";

export const useRenderGridPortal = () => {
  useEffect(() => {
    const shouldRenderPortal = !document.querySelector(`div[id="portal"]`);

    if (shouldRenderPortal) {
      const portalEl = document.createElement("div");
      portalEl.setAttribute("id", "portal");
      portalEl.style.position = "fixed";
      portalEl.style.left = "0";
      portalEl.style.top = "0";
      // keeping z-index at 999, so we can show other MUI components like tooltips etc. on grid editors.
      // all absolute MUI components have zIndex >= 1000
      portalEl.style.zIndex = "999";

      document.body.appendChild(portalEl);
    }
  }, []);
};
