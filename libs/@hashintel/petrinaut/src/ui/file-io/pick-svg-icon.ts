import { maxSubnetIconLength } from "@hashintel/petrinaut-core";

import { iconMaskImage } from "../components/component-glyph/icon-mask";
import { pickFile, readFileText } from "./pick-file";

export type PickedIcon =
  | { ok: true; iconSvg: string }
  | { ok: false; error: string };

const tooLarge: PickedIcon = {
  ok: false,
  error: `That file is too large for an icon: keep it under ${Math.floor(maxSubnetIconLength / 1024)} KB.`,
};

/** The text of a file as a component's icon, or why it cannot be one. */
export const readIconMarkup = (text: string): PickedIcon => {
  const iconSvg = text.trim();
  if (iconSvg.length > maxSubnetIconLength) {
    return tooLarge;
  }
  return iconMaskImage(iconSvg) === null
    ? { ok: false, error: "That file is not an SVG." }
    : { ok: true, iconSvg };
};

/**
 * A file as a component's icon, or why it cannot be one. A file that cannot
 * fit is refused before it is read: UTF-8 spends at most three bytes on one
 * character of the text.
 */
export const readIconFile = async (
  file: Pick<File, "size" | "text">,
): Promise<PickedIcon> => {
  if (file.size > 3 * maxSubnetIconLength) {
    return tooLarge;
  }
  const text = await readFileText(file);
  return text === null
    ? { ok: false, error: "Failed to read file" }
    : readIconMarkup(text);
};

/**
 * Opens a file picker for an SVG and reads it as a component's icon.
 * Resolves `null` when the picker is cancelled.
 */
export const pickSvgIcon = async (): Promise<PickedIcon | null> => {
  const file = await pickFile(".svg,image/svg+xml");
  return file ? readIconFile(file) : null;
};
