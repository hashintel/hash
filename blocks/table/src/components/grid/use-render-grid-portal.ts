import { useEffect } from "react";

export const useRenderGridPortal = () => {
  useEffect(() => {
    const shouldRenderPortal = !document.querySelector(`div[id="portal"]`);

    if (shouldRenderPortal) {
      const portalElement = document.createElement("div");

      portalElement.setAttribute("id", "portal");
      portalElement.style.position = "fixed";
      portalElement.style.left = "0";
      portalElement.style.top = "0";
      portalElement.style.zIndex = "999";

      document.body.appendChild(portalElement);
    }
  }, []);
};
