/**
 * Bitmap fonts for the Pixi renderer. Glyphs are rasterised on demand from
 * the editor's web font, so labels batch with everything else and any
 * character a net uses still renders.
 */

import { BitmapFont } from "pixi.js";

export const pixiLabelFont = "petrinaut-canvas-label";
export const pixiLabelBoldFont = "petrinaut-canvas-label-bold";

const fontFamily = '"Inter Variable", Inter, system-ui, sans-serif';

let installed: Promise<void> | null = null;

/**
 * Installs the fonts once the web font has loaded, so the first rasterised
 * glyphs already use it. Safe to call from every renderer mount.
 */
export const ensurePixiFonts = (): Promise<void> => {
  installed ??= (async () => {
    if (typeof document !== "undefined" && "fonts" in document) {
      await Promise.all([
        document.fonts.load(`500 14px ${fontFamily}`),
        document.fonts.load(`600 14px ${fontFamily}`),
      ]).catch(() => undefined);
    }
    BitmapFont.install({
      name: pixiLabelFont,
      style: { fontFamily, fontSize: 32, fontWeight: "500", fill: 0xffffff },
      resolution: 2,
    });
    BitmapFont.install({
      name: pixiLabelBoldFont,
      style: { fontFamily, fontSize: 32, fontWeight: "600", fill: 0xffffff },
      resolution: 2,
    });
  })();
  return installed;
};
