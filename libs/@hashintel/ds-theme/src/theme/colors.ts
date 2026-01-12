import { gray } from "./colors/gray";
import { red } from "./colors/red";
import { orange } from "./colors/orange";
import { green } from "./colors/green";
import { blue } from "./colors/blue";
import { neutral } from "./colors/neutral";
import { purple } from "./colors/purple";
import { pink } from "./colors/pink";
import { yellow } from "./colors/yellow";
import { accent } from "./colors/accent";
import { accentGray } from "./colors/accent-gray";
import { accentAlpha } from "./colors/accent-alpha";
import { whiteAlpha } from "./colors/white-alpha";
import { border } from "./colors/semantic-border";
import { text } from "./colors/semantic-text";
import { surface } from "./colors/semantic-surface";
import { bg } from "./colors/semantic-bg";
import { icon } from "./colors/semantic-icon";
import { surfaceGlass } from "./colors/semantic-surface-glass";

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
