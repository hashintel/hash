import { PluginContributionBoundary } from "./plugin-boundary";
import { usePetrinautPlugins } from "./plugins-provider";

/** Renders every plugin's `root` inside the editor, each behind its own boundary. */
export const PluginRoots = () =>
  usePetrinautPlugins().map(({ manifest, providers }) =>
    providers.root === undefined ? null : (
      <PluginContributionBoundary
        key={manifest.id}
        pluginId={manifest.id}
        contributionId="root"
        place="root"
      >
        {providers.root}
      </PluginContributionBoundary>
    ),
  );
