import { IconProvider, type IconPack } from "@hashintel/ds-components";
import { HashIconProvider, hashIconPack } from "@hashintel/ds-icons";

import { useUserSettings } from "../../../react/state/user-settings-context";

import type { ReactNode } from "react";

/**
 * Puts every icon below it on the `@hashintel/ds-icons` set. The icons taken
 * from that package animate only while the Animations setting is on, and the
 * design system's `Icon`, which its buttons and menus draw, takes its
 * drawings from the same set.
 *
 * `enabled` is what `useHashIconPackEnabled` returns below: a host's
 * component that asks whether to draw from the set is told yes, whatever a
 * provider above Petrinaut says.
 *
 * Mount it above a component that renders often, not inside one: the
 * provider hands every icon a new context value each time it renders.
 */
export const PetrinautIconProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const showAnimations = useUserSettings((settings) => settings.showAnimations);

  return (
    <HashIconProvider enabled motion={showAnimations ? "auto" : "none"}>
      {/* `satisfies` fails the build when the design system gains an icon
          name the set has no drawing for. */}
      <IconProvider icons={hashIconPack satisfies Required<IconPack>}>
        {children}
      </IconProvider>
    </HashIconProvider>
  );
};
