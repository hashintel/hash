/**
 * The Brunch assistant as a Petrinaut plugin: the manifest and its binding.
 * The body runs in `plugin/use-brunch-plugin.tsx`; the host provides
 * `BrunchHostContext` from `brunch-host.ts`.
 */

import {
  definePetrinautPlugin,
  definePluginManifest,
} from "@hashintel/petrinaut/ui";

import { BrunchConversation } from "../_shared/brunch-conversation";
import { useBrunchPlugin } from "./plugin/use-brunch-plugin";

export const brunchManifest = definePluginManifest({
  id: "website.brunch",
  name: "Brunch",
  description:
    "HASH's process agent: builds and revises the net from a conversation, runs experiments, and keeps a Ledger of what it did.",
  author: "HASH",
  assistant: { label: "Brunch" },
  provides: { conversation: BrunchConversation },
});
export type BrunchManifest = typeof brunchManifest;

export const brunchPlugin = definePetrinautPlugin(
  brunchManifest,
  useBrunchPlugin,
);
