/**
 * Resolves a HASH entity/type icon value to a design-system {@link IconName}.
 *
 * The graph and other icon consumers render {@link IconName} glyphs, but an
 * entity's icon arrives as HASH stores it — the same shapes
 * `EntityOrTypeIcon`/`draw-chip-with-icon` interpret in `hash-frontend`: an
 * emoji, or a `/path`/`https` URL to an SVG (the entity-type icons served from
 * `/icons/types/<name>.svg`). This maps that value to the closest icon already
 * in the ds set by the FontAwesome name in the URL.
 *
 * Only the served type icons that have a genuine ds counterpart are mapped;
 * anything else — an emoji, a non-SVG value, or a type icon with no ds
 * equivalent (brand logos and one-off glyphs) — returns `undefined`, so the
 * caller falls back to its own default and those icons are never drawn.
 */

import type { IconName } from "../../../Icon/icon";

/**
 * FontAwesome icon name (the basename of an `/icons/types/<name>.svg` URL) →
 * the ds {@link IconName} that best matches it. Several served names collapse
 * onto one ds glyph (e.g. the `file-*` and `truck-*` families); type icons with
 * no ds counterpart are deliberately absent, so they resolve to `undefined`.
 * `satisfies` makes the compiler reject any value that is not a registered icon.
 */
const iconNameByFontAwesomeName = {
  "arrow-down-to-bracket": "download",
  "arrow-right-from-bracket": "externalLink",
  "arrow-right-to-bracket": "rightToLine",
  "arrows-rotate": "refresh",
  box: "cube",
  "boxes-packing": "cubes",
  "boxes-stacked": "cubes",
  "bullseye-arrow": "bullseye",
  "calendar-clock": "calendarClock",
  "calendar-days": "calendar",
  "check-double": "check",
  "circle-play": "play",
  comment: "thoughtBubble",
  "comment-quote": "thoughtBubble",
  cube: "cube",
  cubes: "cubes",
  "diagram-project": "diagramProject",
  file: "file",
  "file-excel": "fileSpreadsheet",
  "file-image": "image",
  "file-invoice": "fileLines",
  "file-lines": "fileLines",
  "file-pdf": "fileLines",
  "file-spreadsheet": "fileSpreadsheet",
  "file-word": "fileLines",
  gear: "gear",
  link: "link",
  "list-ol": "list",
  "list-tree": "listTree",
  "list-ul": "list",
  memo: "memoCircleCheck",
  "memo-circle-info": "memoCircleCheck",
  microscope: "microscope",
  page: "file",
  pen: "pencil",
  person: "avatar",
  "plug-circle-check": "plug",
  rectangle: "square",
  text: "text",
  truck: "truck",
  "truck-container": "truck",
  "truck-ramp-box": "truck",
  user: "avatar",
  "user-lock": "avatar",
  "user-plus": "userPlus",
  "user-robot": "avatar",
  "user-tag": "avatar",
  "user-tie": "avatar",
} satisfies Record<string, IconName>;

/** Whether a value is an SVG URL or path (rather than an emoji or plain text). */
const isSvgUrl = (icon: string): boolean =>
  (icon.startsWith("/") ||
    icon.startsWith("http://") ||
    icon.startsWith("https://")) &&
  icon.toLowerCase().split(/[?#]/u)[0]!.endsWith(".svg");

/**
 * The design-system {@link IconName} for a HASH entity/type icon value, or
 * `undefined` when it is an emoji, a non-SVG value, or an SVG whose name has no
 * ds equivalent. Extracts the FontAwesome name from the URL's basename (e.g.
 * `/icons/types/box.svg` → `box`) and looks it up.
 */
export const iconNameFromEntityIcon = (
  icon: string | null | undefined,
): IconName | undefined => {
  if (!icon || !isSvgUrl(icon)) {
    return undefined;
  }
  const path = icon.split(/[?#]/u)[0]!;
  const file = path.slice(path.lastIndexOf("/") + 1);
  const name = file.slice(0, -".svg".length);
  return (iconNameByFontAwesomeName as Record<string, IconName>)[name];
};
