import { Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useStore } from "../../react/use-store";
import { PluginContributionBoundary } from "./plugin-boundary";
import { useInstalledPlugins } from "./plugins-provider";

import type {
  PetrinautFlagSpec,
  PetrinautSettingSection,
  PetrinautSettingSpec,
} from "./plugin-manifest";
import type { ReadableStore } from "@hashintel/petrinaut-core";
import type { AriaAttributes, ReactNode } from "react";

/** The settings dialog's row and group components, passed in to keep one look. */
export interface PluginSettingsRowComponents {
  Group: (props: { title: string; children: ReactNode }) => ReactNode;
  Row: (props: {
    label: string;
    description: string;
    experimental?: boolean;
    wideControl?: boolean;
    children: (aria: AriaAttributes) => ReactNode;
  }) => ReactNode;
}

const selectStyle = css({ width: "[156px]", maxWidth: "[100%]" });

const SettingControl = ({
  spec,
  store,
  aria,
  onChange,
}: {
  spec: PetrinautSettingSpec | PetrinautFlagSpec;
  store: ReadableStore<boolean | string>;
  aria: AriaAttributes;
  onChange: (value: boolean | string) => void;
}) => {
  const value = useStore(store);
  if ("type" in spec && spec.type === "enum") {
    return (
      <Select
        {...aria}
        size="sm"
        className={selectStyle}
        required
        value={String(value)}
        onChange={onChange}
        items={spec.options.map((option) => ({ value: option, text: option }))}
      />
    );
  }
  return (
    <Toggle {...aria} value={value === true} onChange={onChange} size="sm" />
  );
};

const PluginSettingsGroup = ({
  pluginId,
  title,
  settings,
  flags,
  Group,
  Row,
}: {
  pluginId: string;
  title: string;
  settings: [string, PetrinautSettingSpec][];
  flags: [string, PetrinautFlagSpec][];
} & PluginSettingsRowComponents) => {
  const plugins = useInstalledPlugins();
  const installed = plugins.find(({ manifest }) => manifest.id === pluginId);
  const store = installed?.settingsStore;
  if (!store) return null;
  return (
    <Group title={title}>
      {[
        ...settings.map(([key, spec]) => ({ key, spec, experimental: false })),
        ...flags.map(([key, spec]) => ({ key, spec, experimental: true })),
      ].map(({ key, spec, experimental }) => (
        <Row
          key={key}
          label={spec.label}
          description={spec.description ?? ""}
          experimental={experimental}
          wideControl={"type" in spec && spec.type === "enum"}
        >
          {(aria) => (
            <SettingControl
              spec={spec}
              store={store.store(key)}
              aria={aria}
              onChange={(value) => store.set(key, value)}
            />
          )}
        </Row>
      ))}
    </Group>
  );
};

/**
 * One group per installed plugin that declares settings for `section`, or
 * flags when `section` is `labs`. Rows render from the manifest; values live
 * in the plugin's settings store.
 */
export const PluginSettingsRows = ({
  section,
  components: { Group, Row },
}: {
  section: PetrinautSettingSection;
  components: PluginSettingsRowComponents;
}) => {
  const plugins = useInstalledPlugins();
  return plugins.flatMap(({ manifest }) => {
    const settings = Object.entries(manifest.settings ?? {}).filter(
      ([, spec]) => (spec.section ?? "general") === section,
    );
    const flags =
      section === "labs" ? Object.entries(manifest.flags ?? {}) : [];
    if (settings.length === 0 && flags.length === 0) return [];
    return (
      <PluginContributionBoundary
        key={manifest.id}
        pluginId={manifest.id}
        contributionId="settings"
        place="settings"
      >
        <PluginSettingsGroup
          pluginId={manifest.id}
          title={manifest.name}
          settings={settings}
          flags={flags}
          Group={Group}
          Row={Row}
        />
      </PluginContributionBoundary>
    );
  });
};
