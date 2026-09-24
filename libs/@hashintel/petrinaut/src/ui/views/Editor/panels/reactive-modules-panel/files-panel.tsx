import { use, useId, useRef } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { focusLands } from "../../../../worksheet/focus-flow";
import { useFocusStops } from "../../../../worksheet/use-focus-stops";

import type {
  FocusStop,
  FocusStopTarget,
} from "../../../../worksheet/use-focus-stops";
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
  paddingY: "2",
  paddingX: "1",
  '[data-open="false"] > &': { opacity: "[0]" },
  '[data-motion="true"] > &': {
    transition: "[opacity 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

const groupLabelStyle = css({
  paddingTop: "3",
  paddingBottom: "1",
  paddingX: "2",
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.08em]",
  textTransform: "uppercase",
  color: "neutral.s85",
});

// A row of the Entities list: rounded, blue when selected, a shade darker
// while it holds focus, hover on the rest.
const rowStyle = cva({
  base: {
    display: "flex",
    alignItems: "baseline",
    minHeight: "6",
    paddingX: "2",
    paddingY: "[2px]",
    borderRadius: "lg",
    color: "neutral.s110",
    fontSize: "xs",
    lineHeight: "[20px]",
    whiteSpace: "nowrap",
    overflow: "hidden",
    cursor: "pointer",
    backgroundColor: "[transparent]",
    transition: "[background-color 100ms ease-out]",
    _focus: { outline: "none", backgroundColor: "neutral.s25" },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.s30",
        color: "neutral.s120",
        _focus: { backgroundColor: "blue.s40" },
      },
      false: {
        _hover: { backgroundColor: "neutral.bg.surface.hover" },
      },
    },
    main: {
      true: { fontWeight: "medium" },
    },
  },
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

/**
 * The generated files beside the editor: the main file, then the modules by
 * kind. The list follows the worksheet keyboard flow: it is one Tab stop,
 * ArrowUp and ArrowDown walk the files, and a click, an arrow move, Enter or
 * Space shows the file. Open or closed is the caller's, toggled from the
 * flags row.
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
  const labelId = useId();
  const targets = useRef(new Map<string, HTMLElement>());

  // The stops follow the rendered order, so the arrows walk the list as
  // shown: the main file, then group by group.
  const groups = groupFiles(files);
  const stops: FocusStop[] = groups.flatMap((group) =>
    group.files.map((file) => ({ id: file.path, kind: "row" as const })),
  );
  const { onKeyDown, onFocusTarget, tabIndexFor, attach } = useFocusStops({
    stops,
    columnCount: 1,
    focusTarget: (target) => {
      const focused = focusLands(targets.current.get(target.stopId));
      if (focused && target.stopId !== selected) {
        onSelect(target.stopId);
      }
      return focused;
    },
  });

  const renderRow = (file: ReactiveModuleFile, main: boolean) => {
    const target: FocusStopTarget = { stopId: file.path, column: 0 };
    const [stem, extension] = splitName(file.path);
    return (
      <div
        key={file.path}
        role="option"
        aria-selected={file.path === selected}
        ref={(element) => {
          if (element) {
            targets.current.set(file.path, element);
          } else {
            targets.current.delete(file.path);
          }
        }}
        tabIndex={tabIndexFor(target)}
        title={file.path}
        data-main={main}
        className={rowStyle({ selected: file.path === selected, main })}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            onFocusTarget(target);
          }
        }}
        onClick={(event) => {
          event.currentTarget.focus();
          onSelect(file.path);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onSelect(file.path);
          } else {
            onKeyDown(target)(event);
          }
        }}
      >
        <span className={nameStyle}>{stem}</span>
        <span className={extensionStyle}>{extension}</span>
      </div>
    );
  };

  return (
    <div data-open={open} data-motion={showAnimations} className={panelStyle}>
      <div
        ref={attach}
        role="listbox"
        aria-label="Files"
        className={listStyle}
        inert={!open}
      >
        {groups.map((group) =>
          group.label === null ? (
            group.files.map((file) => renderRow(file, true))
          ) : (
            <div
              key={group.label}
              role="group"
              aria-labelledby={`${labelId}-${group.label}`}
            >
              <div id={`${labelId}-${group.label}`} className={groupLabelStyle}>
                {group.label}
              </div>
              {group.files.map((file) => renderRow(file, false))}
            </div>
          ),
        )}
      </div>
    </div>
  );
};
