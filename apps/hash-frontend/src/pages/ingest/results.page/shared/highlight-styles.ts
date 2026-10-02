/** Shared highlight color tokens for selection states across the ingest UI. */
export const highlightColors = {
  /** Border color for bbox overlays on page images. */
  bboxBorder: "rgba(59, 130, 246, 0.7)",
  /** Background fill for bbox overlays on page images. */
  bboxFill: "rgba(59, 130, 246, 0.12)",
  /** Background for selected list items (entity cards, assertion windows). */
  selectedBg: "rgba(59, 130, 246, 0.08)",
  /** Background for hovered list items. */
  hoverBg: "rgba(59, 130, 246, 0.04)",
} as const;
