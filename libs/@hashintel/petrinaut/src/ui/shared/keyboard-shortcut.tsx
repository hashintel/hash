import { Kbd } from "@hashintel/ds-components";

export const KeyboardShortcut = ({
  shortcut,
  tone = "default",
}: {
  shortcut: string;
  tone?: "default" | "inverse";
}) => (
  <Kbd keys={shortcut} variant={tone === "inverse" ? "inherit" : "neutral"} />
);
