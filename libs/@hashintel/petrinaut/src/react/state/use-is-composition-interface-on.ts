import { use } from "react";

import { SDCPNContext } from "./sdcpn-context";
import { useComposesOnly } from "./use-composes-only";
import { UserSettingsContext } from "./user-settings-context";

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
  const { enableNetComponents } = use(UserSettingsContext);
  const composesOnly = useComposesOnly();

  return extensions.subnets && (enableNetComponents || composesOnly);
};
