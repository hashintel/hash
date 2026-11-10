import { maxSubnetIconLength } from "@hashintel/petrinaut-core";

import { iconMaskImage } from "../components/component-glyph/icon-mask";

export type PickedIcon =
  | { ok: true; iconSvg: string }
  | { ok: false; error: string };

/** The text of a file as a component's icon, or why it cannot be one. */
export const readIconMarkup = (text: string): PickedIcon => {
  const iconSvg = text.trim();
  if (iconSvg.length > maxSubnetIconLength) {
    return {
      ok: false,
      error: `That file is too large for an icon: keep it under ${Math.floor(maxSubnetIconLength / 1024)} KB.`,
    };
  }
  return iconMaskImage(iconSvg) === null
    ? { ok: false, error: "That file is not an SVG." }
    : { ok: true, iconSvg };
};

/**
 * Opens a file picker for an SVG and reads it as a component's icon.
 * Resolves `null` when the picker is cancelled.
 */
export function pickSvgIcon(): Promise<PickedIcon | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(
        (text) => resolve(readIconMarkup(text)),
        () => resolve({ ok: false, error: "Failed to read file" }),
      );
    };
    input.oncancel = () => resolve(null);

    input.click();
  });
}
