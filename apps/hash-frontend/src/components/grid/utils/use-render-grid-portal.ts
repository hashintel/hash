import { useTheme } from "@mui/material";
import { useEffect } from "react";

export const useRenderGridPortal = () => {
  /** @todo when switching themes is implemented, make sure this still works as expected */
  const theme = useTheme();

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
      portalEl.style.zIndex = `${theme.zIndex.drawer + 10}`;

      document.body.appendChild(portalEl);
    }
  }, [theme]);
};
