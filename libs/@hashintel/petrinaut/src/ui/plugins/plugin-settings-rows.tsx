import { Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PluginContributionBoundary } from "./plugin-boundary";
import { usePetrinautPlugins } from "./plugins-provider";

import type {
  PetrinautFlagSpec,
  PetrinautSettingSection,
  PetrinautSettingSpec,
} from "./plugin-manifest";
import type { PluginSettings } from "./plugin-settings";
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
  value,
  aria,
  onChange,
}: {
  spec: PetrinautSettingSpec | PetrinautFlagSpec;
  value: boolean | string | undefined;
  aria: AriaAttributes;
  onChange: (value: boolean | string) => void;
}) => {
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
  title,
  settings,
  specs,
  flags,
  Group,
  Row,
}: {
  title: string;
  settings: PluginSettings;
  specs: [string, PetrinautSettingSpec][];
  flags: [string, PetrinautFlagSpec][];
} & PluginSettingsRowComponents) => (
  <Group title={title}>
    {[
      ...specs.map(([key, spec]) => ({ key, spec, experimental: false })),
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
            value={settings.values[key]}
            aria={aria}
            onChange={(value) => settings.set(key, value)}
          />
        )}
      </Row>
    ))}
  </Group>
);

/**
 * One group per plugin that declares settings for `section`, or flags when
 * `section` is `labs`. Rows render from the manifest; values are the plugin's
 * settings state.
 */
export const PluginSettingsRows = ({
  section,
  components: { Group, Row },
}: {
  section: PetrinautSettingSection;
  components: PluginSettingsRowComponents;
}) => {
  const plugins = usePetrinautPlugins();

  return plugins.flatMap(({ manifest, settings }) => {
    const specs = Object.entries(manifest.settings ?? {}).filter(
      ([, spec]) => (spec.section ?? "general") === section,
    );
    const flags =
      section === "labs" ? Object.entries(manifest.flags ?? {}) : [];
    if (specs.length === 0 && flags.length === 0) return [];

    return (
      <PluginContributionBoundary
        key={manifest.id}
        pluginId={manifest.id}
        contributionId="settings"
        place="settings"
      >
        <PluginSettingsGroup
          title={manifest.name}
          settings={settings}
          specs={specs}
          flags={flags}
          Group={Group}
          Row={Row}
        />
      </PluginContributionBoundary>
    );
  });
};
