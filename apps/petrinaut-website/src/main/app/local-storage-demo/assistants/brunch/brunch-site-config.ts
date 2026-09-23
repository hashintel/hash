import { resolveBrunchPreviewConfig } from "../../brunch-preview-config";
import { getOrCreateBrunchPrincipal } from "../../brunch-principal";

/** This site's Brunch endpoint, and whether one is configured at all. */
export const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);

/** The browser's Brunch principal, kept across visits. */
export const brunchPrincipal = getOrCreateBrunchPrincipal();
