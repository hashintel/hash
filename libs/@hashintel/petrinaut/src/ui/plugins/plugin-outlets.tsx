/** Where the editor renders plugin contributions: toolbars, bottom panel tabs and roots. */

import { Button } from "@hashintel/ds-components";
import { cx } from "@hashintel/ds-helpers/css";

import { pluginBottomPanelViewId } from "./define-petrinaut-plugin";
import { PluginBoundary } from "./plugin-boundary";
import { useRunningPlugins } from "./plugins-provider";

import type { PluginBottomPanelTab } from "../../react/state/editor-context";
import type { PluginButtonPlace } from "./define-petrinaut-plugin";
import type { ComponentProps, ReactNode } from "react";

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
  const running = useRunningPlugins();

  return running.flatMap(({ manifest, instanceKey, contributions }) => [
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
  ]);
};

/** A plugin's bottom panel view, as the panel draws its tab. */
export interface PluginBottomPanelTabView {
  readonly id: PluginBottomPanelTab;
  readonly title: string;
  readonly tooltip?: string;
  /** What fills the panel while the tab is the active one. */
  readonly content: ReactNode;
  /** What sits at the right of the tab bar while the tab is the active one. */
  readonly headerAction: ReactNode;
}

/**
 * Every plugin's bottom panel views that show, in plugin order. A view's
 * content and its header action each sit behind the plugin's boundary.
 */
export const usePluginBottomPanelViews =
  (): readonly PluginBottomPanelTabView[] =>
    useRunningPlugins().flatMap(({ manifest, instanceKey, contributions }) =>
      Object.entries(manifest.bottomPanelViews ?? {}).flatMap(([key, spec]) => {
        const view = contributions.bottomPanelViews?.[key];
        if (view === undefined || view.when === false) {
          return [];
        }
        const behindBoundary = (part: string, node: ReactNode) => (
          <PluginBoundary
            key={`${instanceKey}.bottomPanelViews.${key}.${part}`}
            pluginId={manifest.id}
            place="bottom-panel"
            contributionId={key}
          >
            {node}
          </PluginBoundary>
        );

        return [
          {
            id: pluginBottomPanelViewId(manifest.id, key),
            title: spec.title,
            ...(spec.tooltip !== undefined && { tooltip: spec.tooltip }),
            content: behindBoundary("content", view.content),
            headerAction: behindBoundary("headerAction", view.headerAction),
          },
        ];
      }),
    );

/** Every plugin's `root`, inside the editor, each behind its own boundary. */
export const PluginRoots = () =>
  useRunningPlugins().map(({ manifest, instanceKey, contributions }) => (
    <PluginBoundary key={instanceKey} pluginId={manifest.id} place="root">
      {contributions.root}
    </PluginBoundary>
  ));
