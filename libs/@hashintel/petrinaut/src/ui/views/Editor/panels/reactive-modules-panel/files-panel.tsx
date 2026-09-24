import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../react/state/user-settings-context";

import type { ReactiveModuleFile } from "@hashintel/petrinaut-core/reactive-modules";

const WIDTH = 208;

export type FileGroup = {
  /** `null` for the main file, which stands alone at the top. */
  label: string | null;
  files: ReactiveModuleFile[];
};

const GROUP_PREFIXES: [prefix: string, label: string][] = [
  ["transition_", "Transitions"],
  ["place_", "Places"],
  ["draw_", "Draws"],
];

/**
 * The main file first, then the module files by kind, read off the prefix
 * the emitter gives each file name; files of no known kind close the list.
 */
export const groupFiles = (files: ReactiveModuleFile[]): FileGroup[] => {
  const [main, ...modules] = files;
  const groups: FileGroup[] =
    main === undefined ? [] : [{ label: null, files: [main] }];
  const rest: ReactiveModuleFile[] = [];
  for (const [prefix, label] of GROUP_PREFIXES) {
    const members = modules.filter((file) => file.path.startsWith(prefix));
    if (members.length > 0) {
      groups.push({ label, files: members });
    }
  }
  for (const file of modules) {
    if (!GROUP_PREFIXES.some(([prefix]) => file.path.startsWith(prefix))) {
      rest.push(file);
    }
  }
  if (rest.length > 0) {
    groups.push({ label: "Modules", files: rest });
  }
  return groups;
};

// Closes to nothing: the toggle lives in the flags row. Width and border
// transition over the panels' 150 ms; the list fades with them.
const panelStyle = css({
  flexShrink: 0,
  overflow: "hidden",
  width: `[${WIDTH}px]`,
  borderLeft: "[1px solid {colors.neutral.bd.subtle}]",
  '&[data-open="false"]': { width: "[0]", borderLeftWidth: "[0]" },
  '&[data-motion="true"]': {
    transition:
      "[width 150ms ease-in-out, border-left-width 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

// Laid out at the open width, so the rows do not reflow while it closes.
const listStyle = css({
  width: `[${WIDTH}px]`,
  height: "full",
  overflow: "auto",
  overscrollBehavior: "contain",
  margin: "[0]",
  paddingY: "2",
  paddingX: "[0]",
  listStyle: "none",
  '[data-open="false"] > &': { opacity: "[0]" },
  '[data-motion="true"] > &': {
    transition: "[opacity 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

const groupLabelStyle = css({
  paddingTop: "3",
  paddingBottom: "1",
  paddingX: "[14px]",
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.08em]",
  textTransform: "uppercase",
  color: "neutral.s100",
});

const groupListStyle = css({
  margin: "[0]",
  padding: "[0]",
  listStyle: "none",
});

// A row with a hairline accent on the shown file, no boxes.
const itemStyle = css({
  display: "flex",
  alignItems: "baseline",
  width: "full",
  height: "[24px]",
  border: "none",
  borderLeft: "[2px solid transparent]",
  paddingX: "3",
  backgroundColor: "[transparent]",
  color: "neutral.s105",
  fontSize: "xs",
  lineHeight: "[24px]",
  textAlign: "left",
  whiteSpace: "nowrap",
  overflow: "hidden",
  cursor: "pointer",
  _hover: { color: "neutral.fg.heading", backgroundColor: "neutral.s10" },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
  },
  '&[aria-current="true"]': {
    borderLeftColor: "blue.s60",
    color: "neutral.fg.heading",
  },
  '&[data-main="true"]': { fontWeight: "medium" },
});

const nameStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const extensionStyle = css({
  color: "neutral.s90",
});

const splitName = (path: string): [stem: string, extension: string] => {
  const dot = path.lastIndexOf(".");
  return dot <= 0 ? [path, ""] : [path.slice(0, dot), path.slice(dot)];
};

const FileItem = ({
  file,
  main,
  selected,
  onSelect,
}: {
  file: ReactiveModuleFile;
  main: boolean;
  selected: boolean;
  onSelect: (path: string) => void;
}) => {
  const [stem, extension] = splitName(file.path);
  return (
    <li>
      <button
        type="button"
        className={itemStyle}
        data-main={main}
        aria-current={selected ? "true" : undefined}
        title={file.path}
        onClick={() => onSelect(file.path)}
      >
        <span className={nameStyle}>{stem}</span>
        <span className={extensionStyle}>{extension}</span>
      </button>
    </li>
  );
};

/**
 * The generated files beside the editor: the main file, then the modules by
 * kind. Selecting one shows it. Open or closed is the caller's, toggled from
 * the flags row.
 */
export const FilesPanel = ({
  files,
  selected,
  onSelect,
  open,
}: {
  files: ReactiveModuleFile[];
  /** The path of the file the editor shows. */
  selected: string;
  onSelect: (path: string) => void;
  open: boolean;
}) => {
  const { showAnimations } = use(UserSettingsContext);
  return (
    <nav
      aria-label="Files"
      data-open={open}
      data-motion={showAnimations}
      className={panelStyle}
    >
      <ul className={listStyle} inert={!open}>
        {groupFiles(files).map((group) =>
          group.label === null ? (
            group.files.map((file) => (
              <FileItem
                key={file.path}
                file={file}
                main
                selected={file.path === selected}
                onSelect={onSelect}
              />
            ))
          ) : (
            <li key={group.label}>
              <div className={groupLabelStyle}>{group.label}</div>
              <ul className={groupListStyle}>
                {group.files.map((file) => (
                  <FileItem
                    key={file.path}
                    file={file}
                    main={false}
                    selected={file.path === selected}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
};
