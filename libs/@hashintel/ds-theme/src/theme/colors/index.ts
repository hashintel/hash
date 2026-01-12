import { gray } from "./gray";
import { red } from "./red";
import { orange } from "./orange";
import { green } from "./green";
import { blue } from "./blue";
import { neutral } from "./neutral";
import { purple } from "./purple";
import { pink } from "./pink";
import { yellow } from "./yellow";
import { accent } from "./accent";
import { accentGray } from "./accent-gray";
import { accentAlpha } from "./accent-alpha";
import { whiteAlpha } from "./white-alpha";
import { border } from "./semantic-border";
import { text } from "./semantic-text";
import { surface } from "./semantic-surface";
import { bg } from "./semantic-bg";
import { icon } from "./semantic-icon";
import { surfaceGlass } from "./semantic-surface-glass";

/** Core color scales (gray, red, blue, etc.) with light/dark mode values. */
export const coreColors = {
  gray,
  red,
  orange,
  green,
  blue,
  neutral,
  purple,
  pink,
  yellow,
  accent,
  accentGray,
  accentAlpha,
  whiteAlpha,
};

/** Semantic color tokens (bg, text, border, etc.) that reference core colors. */
export const semanticColors = {
  border,
  text,
  surface,
  bg,
  icon,
  surfaceGlass,
};

/** Combined colors export for use in Panda preset. */
export const colors = {
  ...coreColors,
  ...semanticColors,
};
