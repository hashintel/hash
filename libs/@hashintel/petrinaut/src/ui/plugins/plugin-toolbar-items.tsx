import { Button } from "@hashintel/ds-components";
import { cx } from "@hashintel/ds-helpers/css";

import { useCommandRegistry } from "../../react/commands/command-registry";
import { PluginContributionBoundary } from "./plugin-boundary";
import { usePetrinautPlugins } from "./plugins-provider";

import type { PetrinautPluginButtonPlace } from "./plugin-manifest";
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
  PetrinautPluginButtonPlace,
  Partial<ComponentProps<typeof Button>>
>;

/**
 * Renders every plugin's buttons and top-bar items declared for one place, in
 * plugin order: a plugin's buttons first, then its items. The toolbar chooses
 * the button size and variant, so plugin buttons match the built-in ones
 * beside them.
 */
export const PluginToolbarItems = ({
  place,
  buttonClassName,
}: {
  place: PetrinautPluginButtonPlace;
  /** Applied to every plugin button, e.g. the viewport controls' chrome. */
  buttonClassName?: string;
}) => {
  const plugins = usePetrinautPlugins();
  const registry = useCommandRegistry();
  const buttonProps = buttonPropsByPlace[place];

  return plugins.flatMap(({ manifest, providers }) => {
    const buttons = Object.entries(manifest.buttons ?? {})
      .filter(([, spec]) => spec.place === place)
      .map(([key, spec]) => {
        const provider = providers.buttons?.[key];

        return (
          <PluginContributionBoundary
            key={`${manifest.id}.${key}`}
            pluginId={manifest.id}
            contributionId={key}
            place={place}
          >
            <Button
              {...buttonProps}
              ref={provider?.ref}
              aria-label={spec.label}
              tooltip={spec.tooltip ?? spec.label}
              prefix={provider?.icon}
              className={cx(provider?.className, buttonClassName)}
              onClick={() => {
                provider?.onClick?.();
                if (provider?.command !== undefined) {
                  registry?.execute(provider.command);
                }
              }}
            />
          </PluginContributionBoundary>
        );
      });
    const items = Object.entries(manifest.topBarItems ?? {})
      .filter(([, spec]) => spec.place === place)
      .flatMap(([key]) => {
        const item = providers.topBarItems?.[key];

        return item === undefined ? (
          []
        ) : (
          <PluginContributionBoundary
            key={`${manifest.id}.${key}`}
            pluginId={manifest.id}
            contributionId={key}
            place={place}
          >
            {item}
          </PluginContributionBoundary>
        );
      });

    return [...buttons, ...items];
  });
};
