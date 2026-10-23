/**
 * @layerRoot website.plugins
 * @role The demo site's Petrinaut plugins, and the list the editor receives
 */

import { standardComponentsPlugin } from "@hashintel/petrinaut/ui";

import { commandPalettePlugin } from "./command-palette/plugin";
import { sentryFeedbackPlugin } from "./sentry-feedback/plugin";
import { sharePlugin } from "./share/plugin";
import { walkthroughPlugin } from "./walkthrough/plugin";

import type { PetrinautPlugin } from "@hashintel/petrinaut/ui/plugin";

/** The plugins the demo shell passes to `<Petrinaut plugins>`. */
export const demoPlugins: readonly PetrinautPlugin[] = [
  sharePlugin,
  sentryFeedbackPlugin,
  commandPalettePlugin,
  walkthroughPlugin,
  standardComponentsPlugin,
];
