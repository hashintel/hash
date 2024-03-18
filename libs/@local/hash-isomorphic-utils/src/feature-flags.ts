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
] as const;

export type FeatureFlag = (typeof featureFlags)[number];
