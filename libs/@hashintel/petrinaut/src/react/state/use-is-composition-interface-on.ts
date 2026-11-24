import { use } from "react";

import { SDCPNContext } from "../document/sdcpn-context";
import { useComposesOnly } from "../document/use-composes-only";
import { useUserSettings } from "./user-settings-context";

/**
 * Whether the composition interface is on: the Nets panel, the component
 * tool and the Components panel. The user switches it on with the Labs
 * setting "Net Components", and a host that keeps the editor to composing
 * switches it on whatever the setting says. It stays off over a document
 * that cannot hold components.
 *
 * It decides which tools edit composition and nothing else: the components
 * a document already holds draw and run with it off.
 */
export const useIsCompositionInterfaceOn = (): boolean => {
  const { extensions } = use(SDCPNContext);
  const enableNetComponents = useUserSettings(
    (settings) => settings.enableNetComponents,
  );
  const composesOnly = useComposesOnly();

  return extensions.components && (enableNetComponents || composesOnly);
};
