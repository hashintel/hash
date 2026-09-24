import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { ExperimentalIcon } from "../../../../experimental-icons";

import type { ReactiveModuleFile } from "@hashintel/petrinaut-core/reactive-modules";

const OPEN_WIDTH = 200;
const CLOSED_WIDTH = 32;

// Collapses to the toggle's column; the width transitions over the panels'
// 150 ms, and the title and the list fade with it.
const panelStyle = css({
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  overflow: "hidden",
  borderLeft: "[1px solid {colors.neutral.bd.subtle}]",
  width: `[${OPEN_WIDTH}px]`,
  '&[data-open="false"]': { width: `[${CLOSED_WIDTH}px]` },
  '&[data-motion="true"]': {
    transition: "[width 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "[28px]",
  paddingX: "1",
  flexShrink: 0,
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
});

const toggleStyle = css({
  flexShrink: 0,
  color: "neutral.s90",
  _hover: { color: "neutral.s110" },
});

const fadeStyle = css({
  transition: "[opacity 150ms ease-in-out]",
  '[data-open="false"] &': { opacity: "[0]" },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});

const titleStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "[0.02em]",
  color: "neutral.s105",
  whiteSpace: "nowrap",
});

const countStyle = css({
  marginLeft: "auto",
  paddingRight: "1",
  fontSize: "[11px]",
  color: "neutral.s100",
});

const listStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  overflow: "auto",
  overscrollBehavior: "contain",
  margin: "[0]",
  padding: "1",
  listStyle: "none",
});

const itemStyle = css({
  display: "block",
  width: "full",
  border: "none",
  borderRadius: "sm",
  padding: "[3px 6px]",
  backgroundColor: "[transparent]",
  color: "neutral.s110",
  fontFamily: "mono",
  fontSize: "xs",
  textAlign: "left",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.s10" },
  '&[aria-current="true"]': {
    backgroundColor: "neutral.s20",
    color: "neutral.fg.heading",
  },
});

/**
 * The generated files, listed beside the editor with the main file first.
 * Selecting one shows it; the chevron collapses the list to its column and
 * back.
 */
export const FilesPanel = ({
  files,
  selected,
  onSelect,
  open,
  onOpenChange,
}: {
  files: ReactiveModuleFile[];
  /** The path of the file the editor shows. */
  selected: string;
  onSelect: (path: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { showAnimations } = use(UserSettingsContext);
  const toggleLabel = open ? "Collapse files" : "Expand files";
  return (
    <nav
      aria-label="Files"
      data-open={open}
      data-motion={showAnimations}
      className={panelStyle}
    >
      <div className={headerStyle}>
        <Button
          size="xs"
          variant="ghost"
          className={toggleStyle}
          aria-label={toggleLabel}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          prefix={
            <ExperimentalIcon
              name={open ? "chevronRight" : "chevronLeft"}
              size={14}
            />
          }
          tooltip={toggleLabel}
        />
        <span className={`${titleStyle} ${fadeStyle}`}>Files</span>
        <span className={`${countStyle} ${fadeStyle}`}>{files.length}</span>
      </div>
      <ul className={`${listStyle} ${fadeStyle}`} inert={!open}>
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              className={itemStyle}
              aria-current={file.path === selected ? "true" : undefined}
              onClick={() => onSelect(file.path)}
            >
              {file.path}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};
