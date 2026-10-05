import { usePetrinautPlugins } from "./plugins-provider";

/** Whether a plugin's root currently covers the editor, e.g. a modal or a tour. */
export const usePluginOverlay = (): boolean =>
  usePetrinautPlugins().some(({ providers }) => providers.overlay === true);
