import { useEffect } from "react";
import { useTheme } from "@mui/material";

export const useRenderGridPortal = () => {
  /** @todo When switching themes is implemented, make sure this still works as expected */
  const theme = useTheme();

  useEffect(() => {
    const shouldRenderPortal = !document.querySelector(`div[id="portal"]`);

    if (shouldRenderPortal) {
      const portalElement = document.createElement("div");

      portalElement.setAttribute("id", "portal");
      portalElement.style.position = "fixed";
      portalElement.style.left = "0";
      portalElement.style.top = "0";
      // keeping z-index at 999, so we can show other MUI components like tooltips etc. on grid editors.
      // all absolute MUI components have zIndex >= 1000
      portalElement.style.zIndex = `${theme.zIndex.drawer + 10}`;

      document.body.appendChild(portalElement);
    }
  }, [theme]);
};
