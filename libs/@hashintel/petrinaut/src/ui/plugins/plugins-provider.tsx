import { createContext, use, type ReactNode } from "react";

import {
  CommandRegistryProvider,
  useCommandRegistry,
} from "../../react/commands/command-registry";

import type { PetrinautPlugin } from "./plugin";

export type PetrinautPluginsConfiguration = {
  /** The host's plugins, installed after the built-ins. */
  plugins: readonly PetrinautPlugin[];
  /**
   * The built-in set the editor installs first. `undefined` means the
   * editor's default; an explicit list replaces it, `[]` removes it.
   */
  builtInPlugins: readonly PetrinautPlugin[] | undefined;
};

const PetrinautPluginsContext = createContext<PetrinautPluginsConfiguration>({
  plugins: [],
  builtInPlugins: undefined,
});

export type PetrinautPluginsProviderProps = {
  plugins: readonly PetrinautPlugin[];
  /**
   * Replaces the editor's built-in plugins. Omit to keep them; pass a subset
   * to drop one; pass `[]` for an editor with only the host's plugins.
   */
  builtInPlugins?: readonly PetrinautPlugin[];
  children: ReactNode;
};

/**
 * Installs plugins into every `<Petrinaut>` and `<PetrinautPreview>` below.
 * Plugin commands need a command registry, so one is created here when the
 * host has not mounted its own `CommandRegistryProvider` above.
 */
export const PetrinautPluginsProvider = ({
  plugins,
  builtInPlugins,
  children,
}: PetrinautPluginsProviderProps) => {
  const ambientRegistry = useCommandRegistry();
  const content = (
    <PetrinautPluginsContext value={{ plugins, builtInPlugins }}>
      {children}
    </PetrinautPluginsContext>
  );
  return ambientRegistry ? (
    content
  ) : (
    <CommandRegistryProvider>{content}</CommandRegistryProvider>
  );
};

/** The host's plugin configuration; the defaults outside a provider. */
export const usePetrinautPluginsConfiguration =
  (): PetrinautPluginsConfiguration => use(PetrinautPluginsContext);
