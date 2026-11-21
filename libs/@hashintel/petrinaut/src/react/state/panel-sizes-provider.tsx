import { use, useState } from "react";

import { createPanelSizes } from "./panel-sizes";
import { PanelSizesContext } from "./panel-sizes-context";
import { UserSettingsContext } from "./user-settings-context";

/** Owns the editor's panel sizes, started from the saved settings. */
export const PanelSizesProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { leftSidebarWidth, propertiesPanelWidth, bottomPanelHeight } =
    use(UserSettingsContext);
  const [panelSizes] = useState(() =>
    createPanelSizes({
      leftSidebarWidth,
      propertiesPanelWidth,
      bottomPanelHeight,
    }),
  );

  return <PanelSizesContext value={panelSizes}>{children}</PanelSizesContext>;
};
