/** What an MDX slide may use without importing it, in the deck and in print. */

import { DiagramPart } from "./diagram-part";
import { LayerCard } from "./docs/layer-card";
import { Morph } from "./morph";
import { OnlyInline, Reveal, RevealInline } from "./reveal";

export const slideMdxComponents = {
  DiagramPart,
  LayerCard,
  Morph,
  OnlyInline,
  Reveal,
  RevealInline,
};
