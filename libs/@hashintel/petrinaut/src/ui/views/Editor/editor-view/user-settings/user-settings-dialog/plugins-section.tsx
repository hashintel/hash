import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { aiAssistantPropPluginId } from "../../../../../plugins/ai-assistant-prop-plugin";
import {
  usePetrinautPluginList,
  usePetrinautPlugins,
} from "../../../../../plugins/plugins-provider";
import { PluginRow } from "./plugins-section/plugin-row";

const tableStyle = css({
  marginTop: "3",
  border: "[1px solid {colors.neutral.s40}]",
  borderRadius: "xl",
  overflow: "hidden",
  // The rows animate their colours, chevrons and disclosures; nothing moves
  // while the user turns animations off or prefers reduced motion.
  "&:not([data-animated]) *": { transition: "[none !important]" },
  "@media (prefers-reduced-motion: reduce)": {
    "& *": { transition: "[none !important]" },
  },
});

const tableHeaderStyle = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  paddingX: "3",
  paddingY: "1.5",
  background: "neutral.s10",
  borderBottom: "[1px solid {colors.neutral.s40}]",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
});

const emptyStyle = css({
  marginTop: "3",
  fontSize: "sm",
  color: "neutral.fg.heading",
});

/**
 * The Plugins section: one table of every plugin passed to this editor, one
 * row each, with a switch to run it and what it contributes.
 */
export const PluginsSection = () => {
  // The `aiAssistant` prop runs as a plugin, but the host passed a prop, not a
  // plugin: the section lists only the plugins passed as `plugins`.
  const statuses = usePetrinautPluginList().filter(
    ({ plugin }) => plugin.manifest.id !== aiAssistantPropPluginId,
  );
  const contributions = usePetrinautPlugins().filter(
    ({ manifest }) => manifest.id !== aiAssistantPropPluginId,
  );
  const { showAnimations } = use(UserSettingsContext);
  if (statuses.length === 0) {
    return <p className={emptyStyle}>No plugins are passed to this editor.</p>;
  }
  const contributionOf = (pluginId: string) =>
    contributions.find(({ manifest }) => manifest.id === pluginId);

  return (
    <section
      aria-label="Installed plugins"
      className={tableStyle}
      data-animated={showAnimations || undefined}
    >
      <header className={tableHeaderStyle}>
        <span>
          {statuses.length === 1 ? "1 plugin" : `${statuses.length} plugins`}
        </span>
        <span>{contributions.length} running</span>
      </header>
      {statuses.map((status) => (
        <PluginRow
          key={status.plugin.manifest.id}
          status={status}
          contribution={contributionOf(status.plugin.manifest.id)}
          statuses={statuses}
        />
      ))}
    </section>
  );
};
