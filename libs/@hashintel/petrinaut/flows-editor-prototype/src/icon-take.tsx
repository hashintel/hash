/**
 * Icon set and menu shadow takes for the DS call (9 Nov). Defaults unchanged.
 *
 * - `?icons=ds`: the HASH set (`hashIconPack`, @hashintel/ds-icons) at its default weight 400, a 2-unit stroke on
 *   its 24 grid that scales with the icon (1.33 px at 16 px, 1 px at 12 px).
 * - `?icons=ds-thin`: the HASH set held at an absolute 1.25 px stroke, today's weight, for a fair comparison.
 * - `?icons=fa`: no provider, so the DS falls back to its own Font Awesome SVGs.
 * - `?menushadow=figma`: menus get the Figma DS Menu: `shadow-lg` (0 10 15 -3 and 0 4 6 -4, black 10 %), a 1 px
 *   border-subtle hairline (13 %) and radius 10. The shadow is already Figma's inside `.petrinaut-root`, whose
 *   preset defines `--shadows-lg`; today's menus differ only in radius (8) and the Select's border (20 %).
 * - `?menushadow=stub`: the ds-components Park UI `lg` stub, for reference.
 */
import { hashIconPack } from "@hashintel/ds-icons";

import type { IconProvider } from "@hashintel/ds-components";
import type { ComponentType, SVGProps } from "react";

import { thinIcons } from "./thin-icons";

type IconPack = React.ComponentProps<typeof IconProvider>["icons"];

const params = new URLSearchParams(globalThis.location.search);
const iconsTake = params.get("icons");

const injectSheet = (id: string, text: string) => {
  if (globalThis.document.getElementById(id)) {
    return;
  }
  const sheet = globalThis.document.createElement("style");
  sheet.id = id;
  sheet.textContent = text;
  globalThis.document.head.append(sheet);
};

const thinHash = (): IconPack => {
  injectSheet(
    "flows-hash-icon-stroke",
    "svg[data-petricon] * { vector-effect: non-scaling-stroke; }",
  );
  return Object.fromEntries(
    Object.entries(hashIconPack).map(([name, HashIconComponent]) => {
      const Inner = HashIconComponent as ComponentType<SVGProps<SVGSVGElement>>;
      const ThinHashIcon = (props: SVGProps<SVGSVGElement>) => (
        <Inner strokeWidth={1.25} {...props} />
      );
      return [name, ThinHashIcon];
    }),
  ) as IconPack;
};

export const iconPackTake: IconPack =
  iconsTake === "ds"
    ? (hashIconPack as IconPack)
    : iconsTake === "ds-thin"
      ? thinHash()
      : iconsTake === "fa"
        ? {}
        : thinIcons;

const figmaMenuShadow =
  "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)";

// The ds-components `lg` stub (Park UI), which a page outside Petrinaut's preset would get.
if (params.get("menushadow") === "stub") {
  injectSheet(
    "flows-menu-shadow-stub",
    `[data-scope="menu"][data-part="content"],
     [data-scope="select"][data-part="content"] {
       box-shadow: 0 8px 16px var(--colors-neutral-a40), 0 0 1px var(--colors-neutral-a40) !important;
     }`,
  );
}

if (params.get("menushadow") === "figma") {
  injectSheet(
    "flows-menu-shadow-figma",
    `[data-menu-surface],
     [data-scope="menu"][data-part="content"],
     [data-scope="select"][data-part="content"],
     [data-scope="combobox"][data-part="content"] {
       box-shadow: ${figmaMenuShadow} !important;
       border: 1px solid rgba(0,0,0,0.13) !important;
       border-radius: 10px !important;
     }`,
  );
}
