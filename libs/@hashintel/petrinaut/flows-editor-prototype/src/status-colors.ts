/**
 * The Flows colours, in one place, as three switchable palettes (Aakarsh, 4 Nov: "I might switch my mind between
 * today's color prototype and subtle semantics. Make these switches easy to do"). Source: the colour review,
 * ops/projects/flows-editor/review/flows-colours.html, options O0, O2 and O4.
 *
 * - `today` (O0): today's state colours and kind-tinted icon tiles; blue selection.
 * - `o2` (Subtle semantic): pale green, red and blue for state; neutral tiles and selection, so blue only means running.
 * - `o4` (Kind tints): O2's states and selection, with s15 kind tints on the tiles and neutral icons.
 *
 * Every palette has the same roles. Each role is a DS colour token, written to a `--flows-*` CSS variable,
 * so a switch applies live. Components only ever read the variables (`statusColor`, `barColor`, `chartColor`,
 * `tileColor`, and `var(--flows-sel-border)` and friends in styles). Card bars stay the faint 2 px ones in every
 * palette; `today` keeps its neutral alpha bars.
 *
 * Pick: ?colours=today|o2|o4, or ⌘K "Colours: …". Remembered in localStorage; the default is `today`.
 */

export type PaletteId = "today" | "o2" | "o4";

export const paletteNames: Record<PaletteId, string> = {
  today: "Today",
  o2: "Subtle",
  o4: "Kind tints",
};

type RunState =
  | "done"
  | "failed"
  | "running"
  | "waiting"
  | "notRun"
  | "skipped";
type StateRoles = {
  mark: string;
  bar: string;
  chart: string;
  text: string;
  badgeBg: string;
  badgeFg: string;
};
export type TileKind = "start" | "action" | "fetch" | "branch" | "ask" | "ai";
type Palette = {
  states: Record<RunState, StateRoles>;
  selection: { border: string; rowBg: string; halo: string };
  tiles: Record<TileKind, { bg: string; icon: string }>;
  ghost: { border: string; tileBg: string; tileIcon: string };
};

/** Shared by O2 and O4. */
const subtleStates: Palette["states"] = {
  done: {
    mark: "green.s80",
    bar: "green.s50",
    chart: "green.s60",
    text: "green.s110",
    badgeBg: "green.s20",
    badgeFg: "green.s110",
  },
  failed: {
    mark: "red.s90",
    bar: "red.s60",
    chart: "red.s70",
    text: "red.s110",
    badgeBg: "red.s20",
    badgeFg: "red.s110",
  },
  running: {
    mark: "blue.s80",
    bar: "blue.s50",
    chart: "blue.s80",
    text: "blue.s110",
    badgeBg: "blue.s20",
    badgeFg: "blue.s110",
  },
  waiting: {
    mark: "neutral.s80",
    bar: "neutral.s30",
    chart: "neutral.s80",
    text: "neutral.s90",
    badgeBg: "neutral.s20",
    badgeFg: "neutral.s100",
  },
  notRun: {
    mark: "neutral.s70",
    bar: "neutral.s20",
    chart: "neutral.s70",
    text: "neutral.s90",
    badgeBg: "neutral.s20",
    badgeFg: "neutral.s90",
  },
  skipped: {
    mark: "neutral.s90",
    bar: "neutral.s40",
    chart: "neutral.s90",
    text: "neutral.s90",
    badgeBg: "neutral.s20",
    badgeFg: "neutral.s90",
  },
};

const neutralSelection: Palette["selection"] = {
  border: "neutral.s110",
  rowBg: "neutral.s20",
  halo: "neutral.a25",
};

const neutralGhost: Palette["ghost"] = {
  border: "neutral.s70",
  tileBg: "neutral.s15",
  tileIcon: "neutral.s90",
};

const tiles = (
  bg: Record<TileKind, string>,
  icon: string | Record<TileKind, string>,
): Palette["tiles"] => ({
  start: { bg: bg.start, icon: typeof icon === "string" ? icon : icon.start },
  action: {
    bg: bg.action,
    icon: typeof icon === "string" ? icon : icon.action,
  },
  fetch: { bg: bg.fetch, icon: typeof icon === "string" ? icon : icon.fetch },
  branch: {
    bg: bg.branch,
    icon: typeof icon === "string" ? icon : icon.branch,
  },
  ask: { bg: bg.ask, icon: typeof icon === "string" ? icon : icon.ask },
  ai: { bg: bg.ai, icon: typeof icon === "string" ? icon : icon.ai },
});

export const palettes: Record<PaletteId, Palette> = {
  today: {
    states: {
      // Bars: the faint 2 px neutral alpha bars Aakarsh approved on 4 Nov.
      done: {
        mark: "neutral.s100",
        bar: "neutral.a25",
        chart: "green.s90",
        text: "neutral.s100",
        badgeBg: "green.s20",
        badgeFg: "green.s100",
      },
      failed: {
        mark: "red.s90",
        bar: "neutral.a45",
        chart: "red.s90",
        text: "red.s90",
        badgeBg: "red.s30",
        badgeFg: "red.s110",
      },
      running: {
        mark: "blue.s90",
        bar: "neutral.a25",
        chart: "blue.s90",
        text: "blue.s90",
        badgeBg: "blue.s20",
        badgeFg: "blue.s100",
      },
      waiting: {
        mark: "neutral.s80",
        bar: "neutral.a45",
        chart: "neutral.s80",
        text: "neutral.s90",
        badgeBg: "neutral.s20",
        badgeFg: "neutral.s100",
      },
      notRun: {
        mark: "neutral.s80",
        bar: "neutral.a10",
        chart: "neutral.s80",
        text: "neutral.s90",
        badgeBg: "neutral.s20",
        badgeFg: "neutral.s90",
      },
      skipped: {
        mark: "neutral.s90",
        bar: "neutral.a15",
        chart: "neutral.s90",
        text: "neutral.s90",
        badgeBg: "neutral.s20",
        badgeFg: "neutral.s90",
      },
    },
    selection: { border: "blue.a80", rowBg: "neutral.s20", halo: "blue.a25" },
    tiles: tiles(
      {
        start: "blue.s20",
        action: "green.s20",
        fetch: "orange.s20",
        branch: "orange.s20",
        ask: "orange.s20",
        ai: "green.s20",
      },
      {
        start: "neutral.s100",
        action: "green.s100",
        fetch: "orange.s100",
        branch: "orange.s100",
        ask: "orange.s100",
        ai: "green.s100",
      },
    ),
    ghost: {
      border: "neutral.a60",
      tileBg: "blue.s20",
      tileIcon: "neutral.s100",
    },
  },
  o2: {
    states: subtleStates,
    selection: neutralSelection,
    tiles: tiles(
      {
        start: "neutral.s15",
        action: "neutral.s15",
        fetch: "neutral.s15",
        branch: "neutral.s15",
        ask: "neutral.s15",
        ai: "neutral.s15",
      },
      "neutral.s100",
    ),
    ghost: neutralGhost,
  },
  o4: {
    states: subtleStates,
    selection: neutralSelection,
    tiles: tiles(
      {
        start: "neutral.s15",
        action: "neutral.s15",
        fetch: "orange.s15",
        branch: "purple.s15",
        ask: "yellow.s15",
        ai: "pink.s15",
      },
      "neutral.s100",
    ),
    ghost: neutralGhost,
  },
};

/** "green.s80" → its DS CSS variable. */
const tokenVar = (token: string) => `var(--colors-${token.replace(".", "-")})`;

const flowsVar = (name: string) => `var(--flows-${name})`;

const variablesOf = (palette: Palette): Record<string, string> => {
  const variables: Record<string, string> = {};
  for (const [state, roles] of Object.entries(palette.states)) {
    for (const [role, token] of Object.entries(roles)) {
      variables[`--flows-${state}-${role}`] = tokenVar(token);
    }
  }
  variables["--flows-sel-border"] = tokenVar(palette.selection.border);
  variables["--flows-sel-row"] = tokenVar(palette.selection.rowBg);
  variables["--flows-sel-halo"] = tokenVar(palette.selection.halo);
  for (const [kind, tile] of Object.entries(palette.tiles)) {
    variables[`--flows-tile-${kind}-bg`] = tokenVar(tile.bg);
    variables[`--flows-tile-${kind}-icon`] = tokenVar(tile.icon);
  }
  variables["--flows-ghost-border"] = tokenVar(palette.ghost.border);
  variables["--flows-ghost-tile-bg"] = tokenVar(palette.ghost.tileBg);
  variables["--flows-ghost-tile-icon"] = tokenVar(palette.ghost.tileIcon);
  return variables;
};

const storageKey = "flows-proto:colours:v1";

const isPaletteId = (value: string | null): value is PaletteId =>
  value === "today" || value === "o2" || value === "o4";

let current: PaletteId = "today";
const listeners = new Set<() => void>();

export const currentPalette = () => current;

export const subscribePalette = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Writes the palette's variables (live, no reload) and remembers it. They go on `.petrinaut-root`, the element the
 * DS token variables are defined on, so each `var(--colors-…)` resolves there.
 */
export const applyPalette = (id: PaletteId) => {
  current = id;
  const { document } = globalThis;
  let sheet = document.getElementById("flows-palette");
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = "flows-palette";
    document.head.append(sheet);
  }
  const declarations = Object.entries(variablesOf(palettes[id]))
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  sheet.textContent = `.petrinaut-root { ${declarations} }`;
  document.documentElement.dataset.flowsColours = id;
  try {
    globalThis.localStorage.setItem(storageKey, id);
  } catch {
    // Blocked storage: the pick lasts for this page.
  }
  for (const listener of listeners) {
    listener();
  }
};

/** At start: ?colours= wins, then the remembered pick, then `today`. */
export const initPalette = () => {
  const fromQuery = new URLSearchParams(globalThis.location.search).get(
    "colours",
  );
  let stored: string | null = null;
  try {
    stored = globalThis.localStorage.getItem(storageKey);
  } catch {
    // Blocked storage.
  }
  applyPalette(
    isPaletteId(fromQuery) ? fromQuery : isPaletteId(stored) ? stored : "today",
  );
};

/** Run-state glyph colours. Needs review is a waiting state (no orange in any palette). */
export const statusColor = {
  done: flowsVar("done-mark"),
  failed: flowsVar("failed-mark"),
  running: flowsVar("running-mark"),
  review: flowsVar("waiting-mark"),
  /** Skipped, abandoned. */
  quiet: flowsVar("skipped-mark"),
  notReached: flowsVar("notRun-mark"),
  /** The empty track of a bar or chart. */
  track: flowsVar("notRun-bar"),
  onSolid: "var(--colors-neutral-bg-solid-min)",
} as const;

/** Status text: red for a failure, and so on. */
export const statusText = {
  done: flowsVar("done-text"),
  failed: flowsVar("failed-text"),
  running: flowsVar("running-text"),
  waiting: flowsVar("waiting-text"),
} as const;

/** History's run chart. */
export const chartColor = {
  done: flowsVar("done-chart"),
  failed: flowsVar("failed-chart"),
  running: flowsVar("running-chart"),
  review: flowsVar("waiting-chart"),
  quiet: flowsVar("skipped-chart"),
} as const;

/** The 2 px run bar on canvas cards; running pulses. */
export const barColor = {
  done: flowsVar("done-bar"),
  failed: flowsVar("failed-bar"),
  running: flowsVar("running-bar"),
  review: flowsVar("waiting-bar"),
  skipped: flowsVar("skipped-bar"),
  rest: flowsVar("notRun-bar"),
} as const;

/** Which tile tint a step gets, from its icon (the catalog's kinds: Start, Fetch, If, Ask a person, AI, the rest). */
export const tileKindOf = (icon: string): TileKind => {
  switch (icon) {
    case "play":
      return "start";
    case "download":
    case "externalLink":
    case "microscope":
      return "fetch";
    case "diagramSubtask":
      return "branch";
    case "user":
      return "ask";
    case "sparkles":
    case "thoughtBubble":
    case "fileLines":
      return "ai";
    default:
      return "action";
  }
};

/** A tile's background and icon colour, as inline style. `ghost` for the editor's ghost trigger nodes. */
export const tileColor = (icon: string, ghost = false) =>
  ghost
    ? {
        backgroundColor: flowsVar("ghost-tile-bg"),
        color: flowsVar("ghost-tile-icon"),
      }
    : {
        backgroundColor: flowsVar(`tile-${tileKindOf(icon)}-bg`),
        color: flowsVar(`tile-${tileKindOf(icon)}-icon`),
      };
