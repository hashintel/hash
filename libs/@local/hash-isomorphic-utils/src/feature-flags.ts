export const featureFlags = [
  /**
   * Whether pages should be accessible from the sidebar (either canvases or pages)
   */
  "pages",
  /**
   * Whether canvas can be created/edited via the UI
   */
  "canvases",
  /**
   * Whether documents can be created/edited via the UI
   */
  "documents",
  /**
   * Whether notes can be viewed on the notes page, and created/edited via the UI
   */
  "notes",
  /**
   * Whether workers are enabled (if 'ai' is disabled, 'goals' and AI-related flow steps will not be present)
   */
  "workers",
  /**
   * Whether AI-related features are enabled, e.g. embedding creation, AI-utilising flow steps
   */
  "ai",
] as const;

export type FeatureFlag = (typeof featureFlags)[number];
