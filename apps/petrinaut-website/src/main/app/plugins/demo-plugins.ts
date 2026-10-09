/**
 * @layerRoot website.plugins
 * @role The demo site's Petrinaut plugins, and the list the editor receives
 */

import { commandPalettePlugin } from "./command-palette/plugin";
import { petrinautAiPlugin } from "./petrinaut-ai/plugin";
import { sentryFeedbackPlugin } from "./sentry-feedback/plugin";
import { walkthroughPlugin } from "./walkthrough/plugin";

import type { PetrinautPlugin } from "@hashintel/petrinaut/ui";

/** The demo's plugins that are not an assistant. */
export const editorPlugins: readonly PetrinautPlugin[] = [
  sentryFeedbackPlugin,
  commandPalettePlugin,
  walkthroughPlugin,
];

/** The plugins the demo shell passes to `<Petrinaut plugins>`, with Petrinaut AI as the assistant. */
export const demoPlugins: readonly PetrinautPlugin[] = [
  ...editorPlugins,
  petrinautAiPlugin,
];
