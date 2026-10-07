/**
 * @layerRoot website.plugins
 * @role The demo site's Petrinaut plugins, and the list the editor receives
 */

import { commandPalettePlugin } from "./command-palette/plugin";
import { sentryFeedbackPlugin } from "./sentry-feedback/plugin";

import type { PetrinautPlugin } from "@hashintel/petrinaut/ui";

/** The plugins the demo shell passes to `<Petrinaut plugins>`. */
export const demoPlugins: readonly PetrinautPlugin[] = [
  sentryFeedbackPlugin,
  commandPalettePlugin,
];
