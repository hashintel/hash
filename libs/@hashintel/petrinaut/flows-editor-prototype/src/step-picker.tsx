/**
 * The step picker: one component for every place a step is added (Aakarsh, 5 Nov: "the expanded view and this menu
 * look worlds apart"). The canvas + menu, the left panel's Add tab and an output's "Use in a step" all draw it.
 *
 * `?picker=1..4` picks a take; without it the editor keeps the DS Menu picker as it is. Nothing here is a default
 * until a take is picked.
 * - 1 (K1): search first, one grouped list, the hovered step's line under its title (Attio's Select next step).
 * - 2 (K2): two panes in one surface, groups on the left and their steps on the right; no floating submenu.
 * - 3 (K3): a command palette in the middle of the screen: suggested steps, recent steps, then every step.
 * - 4 (K4): "Add a step" takes the right panel's place, with where the step goes at the top.
 *
 * Tiles follow approved-parts G77 ("Two-line rows"): 32 px with a 16 px icon across both lines of a row with a
 * second line; 24 px with a 14 px icon, in a 32 px slot, on a one-line row. Both in the step's P-a hue.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon, type IconName } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { type CatalogEntry, groupEntries, stepGroups } from "./catalog";
import { RowTile } from "./menu-rows";
import {
  groupIconColour,
  groupRowColour,
  pickerPalette,
  tileColor,
} from "./status-colors";

export type PickerTake = 1 | 2 | 3 | 4;

/** The take from `?picker=`, or null for the DS Menu picker. */
export const pickerTake = (): PickerTake | null => {
  const value = Number(
    new URLSearchParams(globalThis.location.search).get("picker"),
  );
  return value >= 1 && value <= 4 ? (value as PickerTake) : null;
};

/** The colour fix take from `?pickercolour=`, or null to leave the menu as it is. */
export const pickerColour = (): 1 | 2 | 3 | null => {
  const value = Number(
    new URLSearchParams(globalThis.location.search).get("pickercolour"),
  );
  return value >= 1 && value <= 3
    ? (value as 1 | 2 | 3)
    : pickerPalette()
      ? 1
      : null;
};

/** Each step row's second line (Figma, 3 Nov), from the engine's action definitions. */
const stepLines: Record<string, string> = {
  // One line at the menu's 288 px, two at most (Aakarsh, 5 Nov): plain words, no "e.g", no trailing clauses.
  queryEntities: "Search one entity type, with conditions",
  readEntity: "Read one property of an entity",
  createEntity: "Add a new entity to the graph",
  updateEntity: "Change properties on an existing entity",
  requestReview: "Ask someone to approve or reject",
  sendEmail: "Send an email to people",
  getFileFromUrl: "Download a file from a URL",
  if: "Split by a yes/no condition",
  forEach: "Run steps for every item",
  filterList: "Keep only matching items",
  find: "Find the first matching item",
  orderBy: "Sort a list by a field",
  takeFirst: "Keep the first items of a list",
  aggregate: "Count, sum or average a list",
  draftMessage: "Draft a message with AI",
  answerQuestion: "Answer a question with AI",
  getWebPageSummary: "Summarize a web page",
  getWebPageByUrl: "Get a web page's title and text",
  webSearch: "Search the web for a query",
};

/** A step Figma gives no line: the first sentence of its definition's description. */
export const stepLine = (entry: CatalogEntry) =>
  stepLines[entry.id] ??
  entry.description.split(/(?<=\.)\s/)[0]?.replace(/\.$/, "");

/** The Add tab's tile: 14 px, 3 px corners, a 10 px icon, in the step kind's tint with the icon tinted to match. */
const kindTileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[14px]",
  height: "[14px]",
  borderRadius: "[3px]",
  "& svg": { width: "[10px]", height: "[10px]", "--icon-size": "10px" },
});

export const KindTile = ({ icon }: { icon: IconName }) => (
  <span className={kindTileStyle} style={tileColor(icon)} aria-hidden="true">
    <Icon name={icon} size="sm" />
  </span>
);

/** A group's icon: in `?pickercolour=1` the hue its steps take, so a group and its steps match; otherwise neutral. */
export const groupHue = (group: (typeof stepGroups)[number]) => ({
  color:
    (pickerColour() === 1 ? groupIconColour(group.name) : undefined) ??
    "var(--colors-neutral-fg-subtle)",
});

type Section = {
  id: string;
  label: string;
  icon: IconName;
  hue: React.CSSProperties;
  entries: CatalogEntry[];
};

const sectionsOf = (entries: CatalogEntry[]): Section[] => {
  const grouped: Section[] = stepGroups.map((group) => ({
    id: group.name,
    label: group.name,
    icon: group.icon,
    hue: groupHue(group),
    entries: groupEntries(group, entries),
  }));
  const rest = entries.filter(
    (entry) => !stepGroups.some((group) => group.ids.includes(entry.id)),
  );
  return [
    ...grouped,
    {
      id: "Other",
      label: "Other",
      icon: "cube" as IconName,
      hue: { opacity: 0.75 },
      entries: rest,
    },
  ].filter((section) => section.entries.length > 0);
};

const matchesQuery = (entry: CatalogEntry, query: string) =>
  entry.title.toLowerCase().includes(query) ||
  entry.category.toLowerCase().includes(query);

/* ---------- shared parts ---------- */

const searchStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  height: "[36px]",
  paddingX: "3",
  color: "neutral.fg.subtle",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  "& input": {
    flex: "1",
    minWidth: "[0]",
    border: "none",
    outline: "none",
    background: "[transparent]",
    textStyle: "sm",
    color: "neutral.fg.heading",
    _placeholder: { color: "neutral.fg.subtle" },
  },
  "&[data-size=lg]": {
    height: "[48px]",
    paddingX: "4",
    "& input": { textStyle: "base" },
  },
  "&[data-boxed]": {
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    borderRadius: "md",
    height: "[32px]",
    paddingX: "2",
  },
});

const SearchField = ({
  value,
  onChange,
  onKeyDown,
  placeholder = "Search steps",
  size,
  boxed,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  placeholder?: string;
  size?: "lg";
  boxed?: boolean;
  autoFocus?: boolean;
}) => (
  <label
    className={searchStyle}
    data-size={size}
    data-boxed={boxed || undefined}
  >
    <Icon name="search" size="sm" />
    <input
      value={value}
      placeholder={placeholder}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- the picker opens to type into
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      aria-label={placeholder}
    />
  </label>
);

const headingStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "2",
  paddingTop: "3",
  paddingBottom: "1",
  flexShrink: 0,
  textStyle: "xs",
  color: "neutral.fg.subtle",
  borderRadius: "md",
  "&:first-child": { paddingTop: "1" },
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  minHeight: "[32px]",
  flexShrink: 0,
  paddingX: "2",
  paddingY: "[6px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  color: "neutral.fg.heading",
  textStyle: "sm",
  "&[data-active=true]": { backgroundColor: "neutral.bg.surface.hover" },
  // G77: the tile sits in a 32 px slot, 12 px from the text, centred across both lines of a two-line row.
  gap: "3",
});

const rowTextStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  flex: "1",
  minWidth: "[0]",
});

const titleStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  lineHeight: "[20px]",
});

const lineStyle = css({
  textStyle: "xs",
  color: "neutral.fg.subtle",
  lineHeight: "[16px]",
});

const inlineLineStyle = css({
  flex: "1",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

const metaStyle = css({ textStyle: "xs", color: "neutral.fg.subtle" });

type RowLook = "one" | "hoverLine" | "two" | "inline";

const StepRow = ({
  entry,
  active,
  look,
  meta,
  onPick,
  onHover,
}: {
  entry: CatalogEntry;
  active: boolean;
  look: RowLook;
  meta?: string;
  onPick: () => void;
  onHover: () => void;
}) => {
  const two = look === "two" || (look === "hoverLine" && active);
  return (
    <button
      type="button"
      className={rowStyle}
      data-active={active}
      data-two={two || undefined}
      data-step-option={entry.id}
      onClick={onPick}
      onMouseEnter={onHover}
    >
      <RowTile icon={entry.icon} twoLine={two} tint={tileColor(entry.icon)} />
      {look === "inline" ? (
        <>
          <span className={cx(titleStyle, css({ flexShrink: 0 }))}>
            {entry.title}
          </span>
          <span className={inlineLineStyle}>{stepLine(entry)}</span>
        </>
      ) : (
        <span className={rowTextStyle}>
          <span className={titleStyle}>{entry.title}</span>
          {two ? <span className={lineStyle}>{stepLine(entry)}</span> : null}
        </span>
      )}
      {meta ? <span className={metaStyle}>{meta}</span> : null}
    </button>
  );
};

const emptyStyle = css({
  paddingX: "2",
  paddingY: "3",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const contextStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

/* ---------- the four bodies ---------- */

type BodyProps = {
  entries: CatalogEntry[];
  recent: CatalogEntry[];
  suggested?: CatalogEntry[];
  context?: string;
  /** K3's heading over every step ("All steps", or what the steps take). */
  allLabel?: string;
  title: string;
  onPick: (entry: CatalogEntry) => void;
  onClose?: () => void;
  narrow?: boolean;
  autoFocus?: boolean;
};

/** Arrow keys move through `flat`; Enter adds the active one; Escape closes. */
const useKeys = (
  flat: CatalogEntry[],
  onPick: (entry: CatalogEntry) => void,
  onClose?: () => void,
) => {
  const [active, setActive] = useState<string | null>(null);
  const current = flat.find((entry) => entry.id === active) ?? flat[0];
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = current ? flat.indexOf(current) : -1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(flat[Math.min(flat.length - 1, index + 1)]?.id ?? null);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(flat[Math.max(0, index - 1)]?.id ?? null);
    } else if (event.key === "Enter" && current) {
      onPick(current);
    } else if (event.key === "Escape") {
      onClose?.();
    }
  };
  return { activeId: current?.id ?? null, setActive, onKeyDown };
};

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  padding: "2",
  overflowY: "auto",
});

/** K1: search first, one grouped list; the active step shows its line under the title. */
const GroupedList = ({
  entries,
  recent,
  suggested,
  onPick,
  onClose,
  autoFocus,
  look = "hoverLine",
  boxed,
}: BodyProps & { look?: RowLook; boxed?: boolean }) => {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const sections: Section[] = query
    ? [
        {
          id: "results",
          label: "",
          icon: "search",
          hue: {},
          entries: entries.filter((entry) => matchesQuery(entry, query)),
        },
      ]
    : [
        ...(suggested && suggested.length > 0
          ? [
              {
                id: "suggested",
                label: "Suggested",
                icon: "sparkles" as IconName,
                hue: {},
                entries: suggested,
              },
            ]
          : []),
        ...(recent.length > 0
          ? [
              {
                id: "recent",
                label: "Recent",
                icon: "clock" as IconName,
                hue: {},
                entries: recent,
              },
            ]
          : []),
        ...sectionsOf(entries),
      ];
  const flat = sections.flatMap((section) => section.entries);
  const keys = useKeys(flat, onPick, onClose);
  return (
    <>
      <div
        className={boxed ? css({ paddingX: "2", paddingTop: "2" }) : undefined}
      >
        <SearchField
          value={search}
          onChange={setSearch}
          onKeyDown={keys.onKeyDown}
          autoFocus={autoFocus}
          boxed={boxed}
        />
      </div>
      <div className={listStyle}>
        {flat.length === 0 ? (
          <div className={emptyStyle}>No step matches “{search}”</div>
        ) : (
          sections.map((section) => (
            <div key={section.id} className={css({ display: "contents" })}>
              {section.label ? (
                <div
                  className={headingStyle}
                  data-group-row-heading={section.id}
                >
                  {section.label}
                </div>
              ) : null}
              {section.entries.map((entry) => (
                <StepRow
                  key={`${section.id}:${entry.id}`}
                  entry={entry}
                  look={look}
                  active={
                    keys.activeId === entry.id &&
                    flat.indexOf(entry) ===
                      flat.findIndex((candidate) => candidate.id === entry.id)
                  }
                  onPick={() => onPick(entry)}
                  onHover={() => keys.setActive(entry.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
};

const panesStyle = css({
  display: "flex",
  minHeight: "[0]",
  flex: "1",
});

const categoryColumnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  padding: "2",
  flexShrink: 0,
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
});

const categoryStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  height: "[32px]",
  paddingX: "2",
  borderRadius: "md",
  textStyle: "sm",
  color: "neutral.fg.body",
  cursor: "pointer",
  textAlign: "left",
  "& svg": { width: "[14px]", height: "[14px]" },
  "&[data-active=true]": {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
  "&[data-narrow]": {
    justifyContent: "center",
    paddingX: "0",
    width: "[32px]",
  },
});

/** K2: groups on the left, the hovered group's steps on the right, in one surface. */
const TwoPane = ({
  entries,
  recent,
  onPick,
  onClose,
  autoFocus,
  narrow,
}: BodyProps) => {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const sections: Section[] = [
    ...(recent.length > 0
      ? [
          {
            id: "recent",
            label: "Recent",
            icon: "clock" as IconName,
            hue: { opacity: 0.75 },
            entries: recent,
          },
        ]
      : []),
    ...sectionsOf(entries),
  ];
  const [category, setCategory] = useState(sections[0]?.id ?? "");
  const shown = query
    ? entries.filter((entry) => matchesQuery(entry, query))
    : (sections.find((section) => section.id === category)?.entries ?? []);
  const keys = useKeys(shown, onPick, onClose);
  return (
    <>
      <SearchField
        value={search}
        onChange={setSearch}
        onKeyDown={keys.onKeyDown}
        autoFocus={autoFocus}
      />
      <div className={panesStyle}>
        <div
          className={categoryColumnStyle}
          style={{ width: narrow ? 48 : 168 }}
        >
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={categoryStyle}
              data-active={!query && section.id === category}
              data-narrow={narrow || undefined}
              title={narrow ? section.label : undefined}
              onMouseEnter={() => setCategory(section.id)}
              onClick={() => {
                setCategory(section.id);
                setSearch("");
              }}
            >
              <span style={section.hue}>
                <Icon name={section.icon} size="sm" />
              </span>
              {narrow ? null : (
                <span className={css({ flex: "1" })}>{section.label}</span>
              )}
            </button>
          ))}
        </div>
        <div className={cx(listStyle, css({ flex: "1", minWidth: "[0]" }))}>
          {shown.length === 0 ? (
            <div className={emptyStyle}>No step matches “{search}”</div>
          ) : (
            shown.map((entry) => (
              <StepRow
                key={entry.id}
                entry={entry}
                look="two"
                active={keys.activeId === entry.id}
                onPick={() => onPick(entry)}
                onHover={() => keys.setActive(entry.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
};

const footerStyle = css({
  display: "flex",
  gap: "4",
  paddingX: "4",
  height: "[32px]",
  alignItems: "center",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

/** K3: a command palette; suggested and recent steps first, then every step with its line beside it. */
const Palette = ({
  entries,
  recent,
  suggested,
  allLabel = "All steps",
  onPick,
  onClose,
  autoFocus,
  narrow,
}: BodyProps) => {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const groupOf = (entry: CatalogEntry) =>
    stepGroups.find((group) => group.ids.includes(entry.id))?.name ?? "Other";
  const all = sectionsOf(entries).flatMap((section) => section.entries);
  const sections = query
    ? [
        {
          id: "results",
          label: "",
          entries: all.filter((entry) => matchesQuery(entry, query)),
        },
      ]
    : [
        ...(suggested && suggested.length > 0
          ? [{ id: "suggested", label: "Suggested", entries: suggested }]
          : []),
        ...(recent.length > 0
          ? [{ id: "recent", label: "Recent", entries: recent }]
          : []),
        { id: "all", label: allLabel, entries: all },
      ];
  const flat = sections.flatMap((section) => section.entries);
  const keys = useKeys(flat, onPick, onClose);
  return (
    <>
      <SearchField
        value={search}
        onChange={setSearch}
        onKeyDown={keys.onKeyDown}
        placeholder="Add a step…"
        size={narrow ? undefined : "lg"}
        autoFocus={autoFocus}
      />
      <div className={listStyle}>
        {flat.length === 0 ? (
          <div className={emptyStyle}>No step matches “{search}”</div>
        ) : (
          sections.map((section) => (
            <div key={section.id} className={css({ display: "contents" })}>
              {section.label ? (
                <div
                  className={headingStyle}
                  data-group-row-heading={section.id}
                >
                  {section.label}
                </div>
              ) : null}
              {section.entries.map((entry, index) => (
                <StepRow
                  key={`${section.id}:${entry.id}`}
                  entry={entry}
                  look={narrow ? "hoverLine" : "inline"}
                  meta={narrow ? undefined : groupOf(entry)}
                  active={
                    keys.activeId === entry.id &&
                    flat.indexOf(entry) ===
                      sections
                        .slice(0, sections.indexOf(section))
                        .reduce((sum, s) => sum + s.entries.length, 0) +
                        index
                  }
                  onPick={() => onPick(entry)}
                  onHover={() => keys.setActive(entry.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
      {narrow ? null : (
        <div className={footerStyle}>
          <span>↑↓ to move</span>
          <span>↵ to add</span>
          <span>esc to close</span>
        </div>
      )}
    </>
  );
};

const panelHeaderStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  paddingX: "4",
  paddingTop: "4",
  paddingBottom: "3",
});

const panelTitleRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const closeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  borderRadius: "md",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  _hover: {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
});

/** K4: "Add a step" in the right panel's place: where it goes, a search, then every group with each step's line. */
const PanelBody = (props: BodyProps) => (
  <>
    <div className={panelHeaderStyle}>
      <div className={panelTitleRowStyle}>
        <span>{props.title}</span>
        {props.onClose ? (
          <button
            type="button"
            className={closeStyle}
            aria-label="Close"
            onClick={props.onClose}
          >
            <Icon name="close" size="sm" />
          </button>
        ) : null}
      </div>
      {props.context ? (
        <div className={contextStyle}>{props.context}</div>
      ) : null}
    </div>
    <GroupedList {...props} look="two" boxed />
  </>
);

/* ---------- surfaces ---------- */

const floatStyle = css({
  position: "fixed",
  zIndex: "[60]",
  display: "flex",
  flexDirection: "column",
  maxHeight: "[min(520px, calc(100vh - 96px))]",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.08)]",
  overflow: "hidden",
});

const scrimStyle = css({
  position: "fixed",
  inset: "0",
  zIndex: "[59]",
  backgroundColor: "neutral.a10",
});

const sidePanelStyle = css({
  position: "fixed",
  zIndex: "[60]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.subtle",
});

/** The right panel's box, so K4 can sit exactly where it is. */
const rightPanelRect = () => {
  const asides = [...globalThis.document.querySelectorAll("aside")]
    .map((element) => element.getBoundingClientRect())
    .filter(
      (rect) => rect.width > 200 && rect.left > globalThis.innerWidth / 2,
    );
  return asides[0] ?? null;
};

const widthOf: Record<PickerTake, number> = { 1: 288, 2: 480, 3: 560, 4: 384 };

const Body = ({ take, ...props }: BodyProps & { take: PickerTake }) =>
  take === 1 ? (
    <GroupedList {...props} />
  ) : take === 2 ? (
    <TwoPane {...props} />
  ) : take === 3 ? (
    <Palette {...props} />
  ) : (
    <PanelBody {...props} />
  );

/**
 * The picker as it opens from the canvas or a panel row: K1 and K2 by their anchor (above the toolbar, else below),
 * K3 in the middle of the screen, K4 in the right panel's place.
 */
export const FloatingStepPicker = ({
  take,
  anchor,
  above,
  ...props
}: BodyProps & {
  take: PickerTake;
  anchor: React.RefObject<Element | null>;
  above?: boolean;
}) => {
  const surface = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<React.CSSProperties>({
    visibility: "hidden",
  });
  useLayoutEffect(() => {
    const width = widthOf[take];
    if (take === 3) {
      setPlace({
        width,
        top: "18vh",
        maxHeight: "calc(82vh - 24px)",
        left: Math.round((globalThis.innerWidth - width) / 2),
      });
      return;
    }
    if (take === 4) {
      const rect = rightPanelRect();
      setPlace(
        rect
          ? {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }
          : { top: 56, right: 0, bottom: 0, width },
      );
      return;
    }
    const rect = anchor.current?.getBoundingClientRect();
    const height = surface.current?.offsetHeight ?? 400;
    if (!rect) {
      setPlace({ width, top: 120, left: 120 });
      return;
    }
    // Centred over its control, kept inside the window.
    const left = Math.max(
      8,
      Math.min(
        rect.left + rect.width / 2 - width / 2,
        globalThis.innerWidth - width - 8,
      ),
    );
    const top = above
      ? Math.max(8, rect.top - height - 8)
      : Math.min(rect.bottom + 6, globalThis.innerHeight - height - 8);
    setPlace({ width, left, top });
  }, [take, anchor, above]);
  const { onClose } = props;
  // A press outside closes it; the press on the control that opened it (its anchor) does not.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        surface.current?.contains(target) ||
        anchor.current?.contains(target)
      ) {
        return;
      }
      onClose?.();
    };
    const timer = setTimeout(
      () => globalThis.document.addEventListener("mousedown", onDown),
      0,
    );
    return () => {
      clearTimeout(timer);
      globalThis.document.removeEventListener("mousedown", onDown);
    };
  }, [anchor, onClose]);
  // Drawn in place, not portalled: the DS reset and tokens are scoped to the app's root element.
  return (
    <>
      {take === 3 ? <div className={scrimStyle} /> : null}
      <div
        ref={surface}
        role="dialog"
        aria-label={props.title}
        data-step-picker={take}
        className={take === 4 ? sidePanelStyle : floatStyle}
        style={place}
      >
        <Body take={take} {...props} autoFocus />
      </div>
    </>
  );
};

/** The picker inside the left panel's Add tab: the same body, laid flat in the panel. */
export const InlineStepPicker = ({
  take,
  ...props
}: BodyProps & { take: PickerTake }) => (
  <div
    data-step-picker={take}
    className={css({
      display: "flex",
      flexDirection: "column",
      minHeight: "[0]",
    })}
  >
    <Body take={take} {...props} narrow />
  </div>
);

/** `?grouprow=1`: each group row (Browse all, K1's headings) faintly tinted in its group's hue. */
export const GroupRowTint = () => {
  if (new URLSearchParams(globalThis.location.search).get("grouprow") !== "1") {
    return null;
  }
  const rules = stepGroups
    .map((group) => {
      const colour = groupRowColour(group.name);
      return colour
        ? `[role=menuitem]:has([data-group-row="${group.name}"]), [data-group-row-heading="${group.name}"] { background-color: ${colour}; }`
        : "";
    })
    .join("\n");
  return <style>{rules}</style>;
};
