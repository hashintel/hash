/**
 * One plugin in the Plugins table. Collapsed, the row is one line: a tinted
 * monogram, the name and author, a status label and the switch that runs the
 * plugin. Clicking the line opens the description and the plugin's
 * contributions as small tags, with an animated disclosure.
 */

import { use, useId, useState } from "react";

import { Chip, Icon, type IconName, Toggle } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../../../react/state/user-settings-context";
import {
  describePluginContributions,
  type PluginContributionItem,
  type PluginContributionKind,
} from "../../../../../../plugins/plugin-contributions";
import { FocusControls } from "../../../../../../worksheet/focus-controls";

import type { PetrinautPluginManifest } from "../../../../../../plugins/define-petrinaut-plugin";
import type { PluginStatus } from "../../../../../../plugins/plugin-statuses";

const rowStyle = css({
  "& + &": { borderTop: "[1px solid {colors.neutral.s30}]" },
});

/**
 * The row's one line. The disclosure button's overlay covers the whole line,
 * so a click anywhere on it opens the details; the switch sits above it.
 */
const headerStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[40px]",
  paddingX: "3",
  paddingY: "1.5",
  _hover: { background: "neutral.s10" },
  transition: "[background-color 120ms ease]",
});

const summaryStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "0",
  padding: "0",
  border: "none",
  background: "[none]",
  textAlign: "left",
  cursor: "pointer",
  _after: { content: '""', position: "absolute", inset: "0" },
  _focusVisible: {
    outline: "none",
    _after: {
      outline: "[2px solid {colors.blue.s70}]",
      outlineOffset: "[-2px]",
    },
  },
});

const chevronStyle = css({
  display: "inline-flex",
  flexShrink: "0",
  color: "neutral.fg.subtle",
  "[aria-expanded=true] > &": { transform: "rotate(90deg)" },
  transition: "[transform 200ms cubic-bezier(0.2, 0, 0, 1)]",
});

const monogramStyle = css({
  display: "grid",
  placeItems: "center",
  flexShrink: "0",
  width: "[24px]",
  height: "[24px]",
  borderRadius: "md",
  fontSize: "xs",
  fontWeight: "semibold",
  lineHeight: "[1]",
  transition: "[background-color 150ms ease, color 150ms ease]",
});

/** Monogram tints, one per plugin by its id, so a long list stays easy to scan. */
const monogramTints = [
  css({ background: "blue.bg.subtle", color: "blue.fg.heading" }),
  css({ background: "purple.bg.subtle", color: "purple.fg.heading" }),
  css({ background: "green.bg.subtle", color: "green.fg.heading" }),
  css({ background: "orange.bg.subtle", color: "orange.fg.heading" }),
  css({ background: "pink.bg.subtle", color: "pink.fg.heading" }),
] as const;
const monogramOffStyle = css({
  background: "neutral.bg.subtle",
  color: "neutral.fg.subtle",
});

const tintOf = (pluginId: string): string => {
  let hash = 0;
  for (let i = 0; i < pluginId.length; i++) {
    hash = (hash * 31 + pluginId.charCodeAt(i)) % 1_000_003;
  }

  return monogramTints[hash % monogramTints.length] ?? monogramOffStyle;
};

const nameStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
  "[data-off] &": { color: "neutral.fg.subtle" },
  transition: "[color 150ms ease]",
});

const authorStyle = css({
  flexShrink: "0",
  fontSize: "xs",
  color: "neutral.fg.subtle",
});

const switchCellStyle = css({
  position: "relative",
  zIndex: "[1]",
  display: "flex",
  marginLeft: "auto",
  flexShrink: "0",
});

/**
 * Collapses to zero height through the grid row, so the details animate to
 * their natural height without measuring them.
 */
const collapseStyle = css({
  display: "grid",
  gridTemplateRows: "[0fr]",
  opacity: "0",
  "&[data-open]": { gridTemplateRows: "[1fr]", opacity: "1" },
  transition:
    "[grid-template-rows 220ms cubic-bezier(0.2, 0, 0, 1), opacity 180ms ease]",
});

const collapseInnerStyle = css({ overflow: "hidden", minHeight: "0" });

/** Indented to the name: the row's padding, the chevron, the monogram and their gaps. */
const detailsStyle = css({
  paddingTop: "0.5",
  paddingBottom: "2.5",
  paddingRight: "3",
  paddingLeft: "[64px]",
});

const descriptionStyle = css({
  fontSize: "xs",
  lineHeight: "[1.45]",
  color: "neutral.fg.body",
});

const tagsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1",
  marginTop: "1.5",
  listStyle: "none",
});

const tagStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  maxWidth: "full",
  height: "[20px]",
  paddingX: "1.5",
  border: "[1px solid {colors.neutral.s30}]",
  borderRadius: "md",
  background: "neutral.s10",
  fontSize: "[11px]",
  lineHeight: "[1]",
  whiteSpace: "nowrap",
  color: "neutral.fg.body",
});

const tagIconStyle = css({
  display: "inline-flex",
  color: "neutral.fg.subtle",
});

const tagKindStyle = css({ color: "neutral.fg.subtle" });

const tagCodeStyle = css({ fontFamily: "mono", fontSize: "[10.5px]" });

const tagDetailStyle = css({ color: "neutral.fg.subtle" });

const noContributionsStyle = css({
  marginTop: "1.5",
  fontSize: "[11px]",
  color: "neutral.fg.subtle",
});

const contributionKinds: Record<
  PluginContributionKind,
  { readonly label: string; readonly icon: IconName; readonly code?: true }
> = {
  access: { label: "Access", icon: "lockOpen", code: true },
  button: { label: "Button", icon: "cursor" },
  "top-bar-item": { label: "Top bar", icon: "sidebar", code: true },
  command: { label: "Command", icon: "lightning" },
  setting: { label: "Setting", icon: "sliders" },
  provides: { label: "Provides", icon: "plug", code: true },
  root: { label: "Renders", icon: "layer" },
};

const ContributionTag = ({ item }: { item: PluginContributionItem }) => {
  const { label, icon, code } = contributionKinds[item.kind];

  return (
    <li className={tagStyle}>
      <span className={tagIconStyle}>
        <Icon name={icon} size="xs" />
      </span>
      {/* The trailing space keeps the text readable when copied or read aloud. */}
      <span className={tagKindStyle}>{`${label} `}</span>
      <span className={code ? tagCodeStyle : undefined}>{item.subject}</span>
      {item.detail !== undefined && (
        <span className={tagDetailStyle}>{` · ${item.detail}`}</span>
      )}
    </li>
  );
};

export interface PluginRowProps {
  readonly manifest: PetrinautPluginManifest;
  readonly status: PluginStatus;
  /** Whether the running plugin renders a root inside the editor. */
  readonly rendersRoot: boolean;
}

export const PluginRow = ({
  manifest,
  status,
  rendersRoot,
}: PluginRowProps) => {
  const { setPluginEnabled } = use(UserSettingsContext);
  const [open, setOpen] = useState(false);
  const id = useId();
  const contributions = describePluginContributions(manifest, rendersRoot);
  const nameId = `${id}-name`;
  const descriptionId = `${id}-description`;
  const detailsId = `${id}-details`;

  return (
    <div
      role="group"
      aria-labelledby={nameId}
      className={rowStyle}
      data-off={status === "on" ? undefined : true}
    >
      <FocusControls>
        <div className={headerStyle}>
          <button
            type="button"
            className={summaryStyle}
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
          >
            <span className={chevronStyle}>
              <Icon name="chevronRight" size="xs" />
            </span>
            <span
              aria-hidden="true"
              className={cx(
                monogramStyle,
                status === "on" ? tintOf(manifest.id) : monogramOffStyle,
              )}
            >
              {manifest.name.charAt(0).toUpperCase()}
            </span>
            <span id={nameId} className={nameStyle}>
              {manifest.name}
            </span>
            {manifest.author !== undefined && (
              <span className={authorStyle}>by {manifest.author}</span>
            )}
          </button>
          {status === "failed" && (
            <Chip size="xs" color="red" variant="soft" shape="round">
              Not running
            </Chip>
          )}
          <span className={switchCellStyle}>
            <Toggle
              aria-labelledby={nameId}
              aria-describedby={
                manifest.description === undefined ? undefined : descriptionId
              }
              value={status !== "off"}
              onChange={(enabled) => setPluginEnabled(manifest.id, enabled)}
              size="sm"
            />
          </span>
        </div>
      </FocusControls>
      <div
        id={detailsId}
        className={collapseStyle}
        data-open={open || undefined}
        aria-hidden={!open}
        inert={!open}
      >
        <div className={collapseInnerStyle}>
          <div className={detailsStyle}>
            {manifest.description !== undefined && (
              <p id={descriptionId} className={descriptionStyle}>
                {manifest.description}
              </p>
            )}
            {contributions.length === 0 ? (
              <p className={noContributionsStyle}>No contributions</p>
            ) : (
              <ul
                aria-label={`What ${manifest.name} contributes`}
                className={tagsStyle}
              >
                {contributions.map((item) => (
                  <ContributionTag
                    key={`${item.kind}:${item.subject}:${item.detail ?? ""}`}
                    item={item}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
