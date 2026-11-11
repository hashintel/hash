/**
 * What an MDX slide may use without importing it, in the deck and in print:
 * the stepped components a docs page gets too, and the slides' own.
 */

import { stepComponents } from "../steps/components";
import { LayerCard } from "./docs/layer-card";

export const slideMdxComponents = { ...stepComponents, LayerCard };
