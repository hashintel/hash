/**
 * What an exported deck runs: the faces and tokens the slides draw with,
 * the theme following the system's, and the player over the deck's slides,
 * every one imported up front by the export's entry.
 */

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "katex/dist/katex.min.css";
import "../../styles/starlight/props.css";
import "../../styles/chrome.css";
import "../../styles/type.css";
import "../styles/base";
import { createRoot } from "react-dom/client";

import { resolveSlideModule, type SlideKind } from "../slide-module";
import { ExportedDeck } from "./exported-deck";

import type { SlideShape } from "../deck/slide-shape";
import type { DeckLogo } from "../decks";

export interface ExportedSlide {
  id: string;
  kind: SlideKind;
  module: Record<string, unknown>;
}

export const mountExportedDeck = ({
  logo,
  shape,
  slides,
}: {
  logo: DeckLogo;
  shape: SlideShape;
  slides: readonly ExportedSlide[];
}): void => {
  const light = matchMedia("(prefers-color-scheme: light)");
  const followSystem = (): void => {
    document.documentElement.dataset.theme = light.matches ? "light" : "dark";
  };
  followSystem();
  light.addEventListener("change", followSystem);
  const container = document.getElementById("deck");
  if (container === null) {
    throw new Error("an exported deck needs its #deck element");
  }
  createRoot(container).render(
    <ExportedDeck
      logo={logo}
      shape={shape}
      slides={slides.map((slide) => resolveSlideModule(slide, slide.module))}
    />,
  );
};
