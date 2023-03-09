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
      portalEl.style.zIndex = "999";

      document.body.appendChild(portalEl);
    }
  }, []);
};
