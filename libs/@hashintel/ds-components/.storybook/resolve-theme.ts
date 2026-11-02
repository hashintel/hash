/**
 * Resolves the `theme` toolbar global ("light" | "dark" | "auto") to a
 * concrete scheme. The preview and the manager each import this in their own
 * frame; `auto` reads that frame's OS preference, and callers subscribe to
 * `systemDark` changes to track it live.
 */
export const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export const resolveTheme = (selected: string): "light" | "dark" =>
  selected === "dark" || (selected === "auto" && systemDark.matches)
    ? "dark"
    : "light";
