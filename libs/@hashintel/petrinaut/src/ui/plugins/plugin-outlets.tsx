/** Where the editor renders plugin contributions: toolbars and roots. */

import { Button } from "@hashintel/ds-components";
import { cx } from "@hashintel/ds-helpers/css";

import { useCommandRegistry } from "../../react/commands/command-registry";
import { PluginBoundary } from "./plugin-boundary";
import { useRunningPlugins } from "./plugins-provider";

import type { PluginButtonPlace } from "./define-petrinaut-plugin";
import type { ComponentProps } from "react";

const buttonPropsByPlace = {
  "top-bar-start": { size: "sm", variant: "ghost" },
  "top-bar-end": { size: "sm", variant: "ghost" },
  "viewport-controls": {
    size: "xs",
    variant: "subtle",
    tooltipOptions: { position: "left" },
  },
} as const satisfies Record<
  PluginButtonPlace,
  Partial<ComponentProps<typeof Button>>
>;

/** The specs a manifest places at `place`, with their keys. */
const atPlace = <Spec extends { readonly place: string }>(
  specs: Readonly<Record<string, Spec>> | undefined,
  place: PluginButtonPlace,
) => Object.entries(specs ?? {}).filter(([, spec]) => spec.place === place);

/**
 * Every plugin's buttons and top-bar items for one place, in plugin order: a
 * plugin's buttons, then its items. The toolbar sets the button size and
 * variant, so plugin buttons match the built-in ones beside them.
 */
export const PluginToolbarItems = ({
  place,
  buttonClassName,
}: {
  place: PluginButtonPlace;
  /** Added to every plugin button, e.g. the viewport controls' chrome. */
  buttonClassName?: string;
}) => {
  const plugins = useRunningPlugins();
  const registry = useCommandRegistry();

  return plugins.flatMap(({ manifest, contributions }) => [
    ...atPlace(manifest.buttons, place).map(([key, spec]) => {
      const button = contributions.buttons?.[key];

      return (
        <PluginBoundary
          key={`${manifest.id}.buttons.${key}`}
          pluginId={manifest.id}
          place={place}
          contributionId={key}
        >
          <Button
            {...buttonPropsByPlace[place]}
            ref={button?.ref}
            aria-label={spec.label}
            tooltip={spec.tooltip ?? spec.label}
            prefix={button?.icon}
            className={cx(button?.className, buttonClassName)}
            onClick={() => {
              button?.onClick?.();
              if (button?.command !== undefined) {
                registry?.execute(button.command);
              }
            }}
          />
        </PluginBoundary>
      );
    }),
    ...atPlace(manifest.topBarItems, place).map(([key]) => (
      <PluginBoundary
        key={`${manifest.id}.topBarItems.${key}`}
        pluginId={manifest.id}
        place={place}
        contributionId={key}
      >
        {contributions.topBarItems?.[key]}
      </PluginBoundary>
    )),
  ]);
};

/** Every plugin's `root`, inside the editor, each behind its own boundary. */
export const PluginRoots = () =>
  useRunningPlugins().map(({ manifest, contributions }) => (
    <PluginBoundary key={manifest.id} pluginId={manifest.id} place="root">
      {contributions.root}
    </PluginBoundary>
  ));
