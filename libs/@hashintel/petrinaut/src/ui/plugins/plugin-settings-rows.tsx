import { Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { PluginBoundary } from "./plugin-boundary";
import { useRunningPlugins } from "./plugins-provider";

import type {
  PetrinautSettingSpec,
  PluginSettingSection,
} from "./define-petrinaut-plugin";
import type { AriaAttributes, ReactNode } from "react";

/** The settings dialog's group and row components, passed in to keep one look. */
interface PluginSettingsRowComponents {
  Group: (props: { title: string; children: ReactNode }) => ReactNode;
  Row: (props: {
    label: string;
    description: string;
    experimental?: boolean;
    wideControl?: boolean;
    children: (aria: AriaAttributes) => ReactNode;
  }) => ReactNode;
}

/** The width of a select in a settings row. */
export const settingSelectStyle = css({ width: "[156px]", maxWidth: "[100%]" });

const SettingControl = ({
  spec,
  value,
  aria,
  onChange,
}: {
  spec: PetrinautSettingSpec;
  value: boolean | string | undefined;
  aria: AriaAttributes;
  onChange: (value: boolean | string) => void;
}) =>
  spec.type === "enum" ? (
    <Select
      {...aria}
      size="sm"
      className={settingSelectStyle}
      required
      value={String(value)}
      onChange={onChange}
      items={spec.options.map((option) => ({ value: option, text: option }))}
    />
  ) : (
    <Toggle {...aria} value={value === true} onChange={onChange} size="sm" />
  );

/**
 * One group per running plugin with settings in `section`, after the
 * built-in groups. Rows come from the manifest, values from the plugin's
 * settings; `labs` rows carry the experimental marker.
 */
export const PluginSettingsRows = ({
  section,
  components: { Group, Row },
}: {
  section: PluginSettingSection;
  components: PluginSettingsRowComponents;
}) =>
  useRunningPlugins().flatMap(({ manifest, settings }) => {
    const specs = Object.entries(manifest.settings ?? {}).filter(
      ([, spec]) => (spec.section ?? "general") === section,
    );

    return specs.length === 0 ? (
      []
    ) : (
      <PluginBoundary key={manifest.id} pluginId={manifest.id} place="settings">
        <Group title={manifest.name}>
          {specs.map(([key, spec]) => (
            <Row
              key={key}
              label={spec.label}
              description={spec.description ?? ""}
              experimental={section === "labs"}
              wideControl={spec.type === "enum"}
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
      </PluginBoundary>
    );
  });
