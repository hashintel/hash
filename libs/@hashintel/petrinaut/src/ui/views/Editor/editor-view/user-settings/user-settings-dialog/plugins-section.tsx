import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import {
  usePluginStatuses,
  useRunningPlugins,
} from "../../../../../plugins/plugins-provider";
import { PluginRow, type PluginRowProps } from "./plugins-section/plugin-row";

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

/** One row per plugin passed to the editor, with its switch and what it contributes. */
export const PluginsTable = ({ rows }: { rows: readonly PluginRowProps[] }) => {
  const { showAnimations } = use(UserSettingsContext);
  if (rows.length === 0) {
    return <p className={emptyStyle}>This editor has no plugins.</p>;
  }

  return (
    <section
      aria-label="Installed plugins"
      className={tableStyle}
      data-animated={showAnimations || undefined}
    >
      <header className={tableHeaderStyle}>
        <span>{rows.length === 1 ? "1 plugin" : `${rows.length} plugins`}</span>
        <span>
          {rows.filter(({ status }) => status === "on").length} running
        </span>
      </header>
      {rows.map((row) => (
        <PluginRow key={row.manifest.id} {...row} />
      ))}
    </section>
  );
};

/** The Plugins section of User settings. */
export const PluginsSection = () => {
  const statuses = usePluginStatuses();
  const running = useRunningPlugins();

  return (
    <PluginsTable
      rows={statuses.map(({ plugin, status }) => ({
        manifest: plugin.manifest,
        status,
        rendersRoot: running.some(
          ({ manifest, contributions }) =>
            manifest === plugin.manifest && contributions.root !== undefined,
        ),
      }))}
    />
  );
};
