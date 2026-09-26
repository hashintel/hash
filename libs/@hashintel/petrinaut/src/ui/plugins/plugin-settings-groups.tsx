import { FocusControls } from "../worksheet/focus-controls";
import { useInstalledPlugins } from "./installed-plugins";
import { selectPluginSettingsGroups } from "./plugin";
import { PluginContributionBoundary } from "./plugin-boundary";

import type { PetrinautSettingsSection } from "../../react/navigation";
import type { ComponentType, ReactNode } from "react";

/**
 * The installed plugins' groups for one settings section, in install order.
 * `Frame` is the dialog's own group frame, so a plugin group has the same
 * heading and box as a built-in one; its controls join the dialog's
 * arrow-key flow.
 */
export const PluginSettingsGroups = ({
  section,
  Frame,
}: {
  section: PetrinautSettingsSection;
  Frame: ComponentType<{ title: string; children: ReactNode }>;
}) =>
  selectPluginSettingsGroups(useInstalledPlugins(), section).map(
    ({ pluginId, group }) => {
      const Group = group.component;
      return (
        <PluginContributionBoundary
          key={group.id}
          pluginId={pluginId}
          contributionId={group.id}
          place={`settings-${group.section}`}
        >
          <Frame title={group.title}>
            <FocusControls>
              <Group />
            </FocusControls>
          </Frame>
        </PluginContributionBoundary>
      );
    },
  );
