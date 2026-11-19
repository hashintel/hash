import {
  describeDisallowedComponentIconElement,
  disallowedComponentIconElement,
  maxComponentIconLength,
} from "@hashintel/petrinaut-core";

import { iconMaskImage } from "../lib/icon-mask";
import { pickFile, readFileText } from "./pick-file";

type PickedIcon = { ok: true; iconSvg: string } | { ok: false; error: string };

const tooLarge: PickedIcon = {
  ok: false,
  error: `That file is too large for an icon: keep it under ${Math.floor(maxComponentIconLength / 1024)} KB.`,
};

/** The text of a file as a component's icon, or why it cannot be one. */
export const readIconMarkup = (text: string): PickedIcon => {
  const iconSvg = text.trim();
  if (iconSvg.length > maxComponentIconLength) {
    return tooLarge;
  }
  const element = disallowedComponentIconElement(iconSvg);
  if (element !== undefined) {
    return {
      ok: false,
      error: describeDisallowedComponentIconElement(element),
    };
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
  if (file.size > 3 * maxComponentIconLength) {
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
