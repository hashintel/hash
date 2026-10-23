/** Ten well-separated colours for token types, taken in order as types are added. */
export const typeColorPool: readonly string[] = [
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#10b981", // Green
  "#f59e0b", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#6366f1", // Indigo
  "#84cc16", // Lime
];

/** The first pool colour not in `usedColors`; the first colour once all are used. */
export const nextTypeColor = (usedColors: readonly string[]): string =>
  typeColorPool.find((color) => !usedColors.includes(color)) ??
  typeColorPool[0]!;
