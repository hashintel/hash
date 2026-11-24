/** Where the editor renders plugin contributions: toolbars and roots. */

import { Button } from "@hashintel/ds-components";
import { cx } from "@hashintel/ds-helpers/css";

import { PluginBoundary } from "./plugin-boundary";
import { usePluginStatuses, useRunningPlugin } from "./running-plugins";

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

interface PluginToolbarItemsProps {
  place: PluginButtonPlace;
  /** Added to every plugin button, e.g. the viewport controls' chrome. */
  buttonClassName?: string;
}

/** One plugin's buttons, then its top-bar items, for one place. */
const PluginToolbarItemsOf = ({
  pluginId,
  place,
  buttonClassName,
}: PluginToolbarItemsProps & { pluginId: string }) => {
  const running = useRunningPlugin(pluginId);
  if (running === undefined) {
    return null;
  }
  const { manifest, instanceKey, contributions } = running;

  return [
    ...atPlace(manifest.buttons, place).map(([key, spec]) => {
      const button = contributions.buttons?.[key];

      return (
        <PluginBoundary
          key={`${instanceKey}.buttons.${key}`}
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
              // The plugin's own command, not the registry: the button works
              // with no registry around, and a withheld command (`when:
              // false`) is skipped as the palette skips it.
              const command =
                button?.command === undefined
                  ? undefined
                  : contributions.commands?.[button.command];
              if (command !== undefined && command.when !== false) {
                command.run();
              }
            }}
          />
        </PluginBoundary>
      );
    }),
    ...atPlace(manifest.topBarItems, place).map(([key]) => (
      <PluginBoundary
        key={`${instanceKey}.topBarItems.${key}`}
        pluginId={manifest.id}
        place={place}
        contributionId={key}
      >
        {contributions.topBarItems?.[key]}
      </PluginBoundary>
    )),
  ];
};

/**
 * Every plugin's buttons and top-bar items for one place, in plugin order.
 * The toolbar sets the button size and variant, so plugin buttons match the
 * built-in ones beside them. Each plugin's items read that plugin alone, so
 * one plugin publishing renders no other's.
 */
export const PluginToolbarItems = (props: PluginToolbarItemsProps) =>
  usePluginStatuses().map(({ plugin: { manifest } }) => (
    <PluginToolbarItemsOf key={manifest.id} pluginId={manifest.id} {...props} />
  ));

const PluginRoot = ({ pluginId }: { pluginId: string }) => {
  const running = useRunningPlugin(pluginId);

  return running === undefined ? null : (
    <PluginBoundary key={running.instanceKey} pluginId={pluginId} place="root">
      {running.contributions.root}
    </PluginBoundary>
  );
};

/** Every plugin's `root`, inside the editor, each behind its own boundary. */
export const PluginRoots = () =>
  usePluginStatuses().map(({ plugin: { manifest } }) => (
    <PluginRoot key={manifest.id} pluginId={manifest.id} />
  ));
