/**
 * @layerRoot website.plugins
 * @role The demo site's Petrinaut plugins, and the list the editor receives
 */

import { brunchPreviewConfig } from "./brunch/brunch-preview-config";
import { brunchPlugin } from "./brunch/plugin";
import { commandPalettePlugin } from "./command-palette/plugin";
import { resolveDefaultAssistant } from "./demo-plugins/default-assistant";
import { petrinautAiPlugin } from "./petrinaut-ai/plugin";
import { sentryFeedbackPlugin } from "./sentry-feedback/plugin";
import { voicePlugin } from "./voice/plugin";
import { walkthroughPlugin } from "./walkthrough/plugin";

import type { PetrinautPlugin } from "@hashintel/petrinaut/ui";

const assistants =
  resolveDefaultAssistant(import.meta.env.VITE_PETRINAUT_DEFAULT_ASSISTANT) ===
  "brunch"
    ? [brunchPlugin, petrinautAiPlugin]
    : [petrinautAiPlugin, brunchPlugin];

/**
 * The plugins the demo shell passes to `<Petrinaut plugins>`. With a Brunch
 * endpoint, both assistants and Voice, the configured default first.
 */
export const demoPlugins: readonly PetrinautPlugin[] = [
  sentryFeedbackPlugin,
  commandPalettePlugin,
  walkthroughPlugin,
  ...(brunchPreviewConfig.isBrunchConfigured
    ? [...assistants, voicePlugin]
    : [petrinautAiPlugin]),
];
