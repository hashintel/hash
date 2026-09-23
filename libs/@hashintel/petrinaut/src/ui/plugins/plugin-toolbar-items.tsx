import { Button } from "@hashintel/ds-components";
import { cx } from "@hashintel/ds-helpers/css";

import { useCommandRegistry } from "../../react/commands/command-registry";
import { useInstalledPlugins } from "./installed-plugins";
import {
  type PetrinautPluginButtonPlacement,
  selectPluginToolbarItems,
} from "./plugin";
import { PluginContributionBoundary } from "./plugin-boundary";

const buttonPropsByPlacement = {
  "top-bar-start": { size: "sm", variant: "ghost" },
  "top-bar-end": { size: "sm", variant: "ghost" },
  "viewport-controls": {
    size: "xs",
    variant: "subtle",
    tooltipOptions: { position: "left" },
  },
} as const satisfies Record<
  PetrinautPluginButtonPlacement,
  Partial<React.ComponentProps<typeof Button>>
>;

/**
 * Renders the installed plugins' contributions at one toolbar placement, in
 * install order. The toolbar chooses the button size and variant, so plugin
 * buttons match the built-in ones beside them.
 */
export const PluginToolbarItems = ({
  placement,
  buttonClassName,
}: {
  placement: PetrinautPluginButtonPlacement;
  /** Applied to every plugin button, e.g. the viewport controls' chrome. */
  buttonClassName?: string;
}) => {
  const items = selectPluginToolbarItems(useInstalledPlugins(), placement);
  const registry = useCommandRegistry();
  const buttonProps = buttonPropsByPlacement[placement];

  return items.map((item) => {
    if (item.kind === "custom") {
      const Item = item.item.component;
      return (
        <PluginContributionBoundary
          key={item.item.id}
          pluginId={item.pluginId}
          contributionId={item.item.id}
          place={placement}
        >
          <Item />
        </PluginContributionBoundary>
      );
    }
    // The button renders the plugin's icon node, so a failing icon removes
    // this button alone.
    const { button } = item;
    return (
      <PluginContributionBoundary
        key={button.id}
        pluginId={item.pluginId}
        contributionId={button.id}
        place={placement}
      >
        <Button
          {...buttonProps}
          ref={button.ref}
          aria-label={button.label}
          tooltip={button.tooltip ?? button.label}
          prefix={button.icon}
          className={cx(button.className, buttonClassName)}
          onClick={() => {
            button.onClick?.();
            if (button.command !== undefined) {
              registry?.execute(button.command);
            }
          }}
        />
      </PluginContributionBoundary>
    );
  });
};
