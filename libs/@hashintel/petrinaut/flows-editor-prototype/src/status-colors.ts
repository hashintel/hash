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
 * O2 is decided (4 Nov, inbox `picks/flows-colours`), so it is the default. ?colours=today|o4, or ⌘K "Colours: …",
 * shows the others for comparison, read from the URL only and never remembered.
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
  | "needsReview"
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
  node: NodeStatusRoles;
};

/**
 * The run-view card status takes (?nodestatus=1..4, 4 Nov: the subtle bar was "a bit too hard to read"): a stronger
 * bar, a quiet done bar for take 3, and the faint red outline round a failed card for take 4. Each palette has its own:
 * the stronger bar is two steps above that palette's own bar, so O2 and O4 stay pale (4 Nov: "is the green on this
 * page the updated green?").
 *
 * The ?nodeglow= takes tint with the stronger bar colours too, through `color-mix`; `glassShade` (the
 * gradient's foot), `glassDrop` (its soft drop shadow) and `highlight` (the inner light edge) are the glassy take's neutral steps.
 */
type NodeStatusRoles = {
  doneBar: string;
  failedBar: string;
  runningBar: string;
  reviewBar: string;
  skippedBar: string;
  restBar: string;
  quietDoneBar: string;
  failedOutline: string;
  /** ?nodeglow=bar: the darker band that travels along a running segment. */
  runningSweep: string;
  /** ?nodeglow=bar-review: the step a needs-review segment shifts to and back. */
  reviewShift: string;
  glassShade: string;
  glassDrop: string;
  highlight: string;
};

const glassRoles = {
  glassShade: "neutral.a05",
  glassDrop: "neutral.a15",
  highlight: "neutral.s00",
};

/** Today: its saturated state colours, at about s80. */
const nodeStatusRoles: NodeStatusRoles = {
  doneBar: "green.s80",
  // Red one step deeper, as the glyphs have it, so it reads apart from orange.
  failedBar: "red.s90",
  runningBar: "blue.s80",
  reviewBar: "orange.s80",
  skippedBar: "neutral.s60",
  restBar: "neutral.s30",
  quietDoneBar: "neutral.a10",
  failedOutline: "red.s60",
  runningSweep: "blue.s100",
  reviewShift: "orange.s95",
  ...glassRoles,
};

/** O2 and O4: two steps above their s50 bars (red s75 over its s60 bar, one step deeper as the glyphs have it). */
const subtleNodeRoles: NodeStatusRoles = {
  doneBar: "green.s70",
  failedBar: "red.s75",
  runningBar: "blue.s70",
  reviewBar: "orange.s70",
  skippedBar: "neutral.s60",
  restBar: "neutral.s30",
  quietDoneBar: "neutral.a10",
  failedOutline: "red.s60",
  runningSweep: "blue.s90",
  reviewShift: "orange.s85",
  ...glassRoles,
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
  // Marks matched by how strong they look, not by step (4 Nov: "the red reads a lot brighter than everything else"):
  // red is the most saturated hue, so its mark sits at s85 beside green, orange and blue at s80.
  failed: {
    mark: "red.s85",
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
  // Needs review (waiting for a person) is pale orange in every palette (4 Nov call: orange means needs review,
  // blue means in progress). Waiting for a timer or schedule stays neutral.
  needsReview: {
    mark: "orange.s80",
    bar: "orange.s50",
    chart: "orange.s60",
    text: "orange.s110",
    badgeBg: "orange.s20",
    badgeFg: "orange.s110",
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
  halo: "neutral.a10",
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
      // Bars: the faint 2 px neutral alpha bars Aakarsh approved on 4 Nov. Alpha steps are Figma's (figma-colours.ts),
      // about 3× stronger than the old code steps, so each pick is the Figma step nearest the approved value.
      done: {
        mark: "neutral.s100",
        bar: "neutral.a10",
        chart: "green.s90",
        text: "neutral.s100",
        badgeBg: "green.s20",
        badgeFg: "green.s100",
      },
      // Red and blue marks at s85, so neither reads louder than the grey done tick or the s80 orange.
      failed: {
        mark: "red.s85",
        bar: "neutral.a20",
        chart: "red.s90",
        text: "red.s90",
        badgeBg: "red.s30",
        badgeFg: "red.s110",
      },
      running: {
        mark: "blue.s85",
        bar: "neutral.a10",
        chart: "blue.s90",
        text: "blue.s90",
        badgeBg: "blue.s20",
        badgeFg: "blue.s100",
      },
      // Needs review (waiting for a person) is pale orange in every palette (4 Nov call: orange means needs review,
      // blue means in progress). Waiting for a timer or schedule stays neutral.
      needsReview: {
        mark: "orange.s80",
        bar: "orange.s50",
        chart: "orange.s60",
        text: "orange.s110",
        badgeBg: "orange.s20",
        badgeFg: "orange.s110",
      },
      waiting: {
        mark: "neutral.s80",
        bar: "neutral.a20",
        chart: "neutral.s80",
        text: "neutral.s90",
        badgeBg: "neutral.s20",
        badgeFg: "neutral.s100",
      },
      notRun: {
        mark: "neutral.s80",
        bar: "neutral.a05",
        chart: "neutral.s80",
        text: "neutral.s90",
        badgeBg: "neutral.s20",
        badgeFg: "neutral.s90",
      },
      skipped: {
        mark: "neutral.s90",
        bar: "neutral.a05",
        chart: "neutral.s90",
        text: "neutral.s90",
        badgeBg: "neutral.s20",
        badgeFg: "neutral.s90",
      },
    },
    selection: { border: "blue.a80", rowBg: "neutral.s20", halo: "blue.a15" },
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
      border: "neutral.a30",
      tileBg: "blue.s20",
      tileIcon: "neutral.s100",
    },
    node: nodeStatusRoles,
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
    node: subtleNodeRoles,
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
    node: subtleNodeRoles,
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
  for (const [role, token] of Object.entries(palette.node)) {
    variables[`--flows-node-${role}`] = tokenVar(token);
  }
  return variables;
};

/**
 * How done looks (Dei, 5 Nov: "we don't need to make a big song/dance/show 'green' for stuff completed… only show
 * 'failed' and 'with warnings' nodes in red/yellow. Otherwise… a sea of green"). One switch over every palette:
 * - `green` (default): each palette's own done roles; a run with warnings charts as done.
 * - `neutral`: every done role (ticks, bars, Steps tree and log marks, History ticks and chart) becomes a grey
 *   step that sits quietly beside grey text but stays darker than skipped and not run, and a run with warnings
 *   charts in amber. Failed, running and needs review keep their palette colours.
 *
 * Pick: ?done=green|neutral, from the URL only.
 */
export type DoneTone = "green" | "neutral";

export const doneTone: DoneTone =
  new URLSearchParams(globalThis.location.search).get("done") === "neutral"
    ? "neutral"
    : "green";

/**
 * Neutral's done steps. Darker than skipped (bar s60, mark s90) and not run (s30), so a For each bar of 18 done and 2
 * skipped still shows that something ran (5 Nov: in the faint take they "look almost identical"). ?donegrey=faint
 * shows the first, fainter take beside it, from the URL only.
 */
const neutralDoneSteps = {
  darker: {
    roles: {
      mark: "neutral.s100",
      bar: "neutral.s80",
      chart: "neutral.s80",
      text: "neutral.s100",
      badgeBg: "neutral.s20",
      badgeFg: "neutral.s100",
    },
    cardBar: "neutral.s85",
  },
  faint: {
    roles: {
      mark: "neutral.s85",
      bar: "neutral.s60",
      chart: "neutral.s70",
      text: "neutral.s100",
      badgeBg: "neutral.s20",
      badgeFg: "neutral.s100",
    },
    cardBar: "neutral.s75",
  },
} satisfies Record<string, { roles: StateRoles; cardBar: string }>;

const neutralDone =
  neutralDoneSteps[
    new URLSearchParams(globalThis.location.search).get("donegrey") === "faint"
      ? "faint"
      : "darker"
  ];

/** A run that completed with warnings, under `neutral`; `green` keeps it on the done roles. */
const amberWarnings = {
  mark: "yellow.s105",
  chart: "yellow.s80",
  text: "yellow.s110",
};

/** The done-tone overrides, written after the palette's own variables so they win. */
const doneToneVariables = (tone: DoneTone): Record<string, string> => {
  const variables: Record<string, string> = {};
  for (const role of Object.keys(amberWarnings)) {
    variables[`--flows-warnings-${role}`] = flowsVar(`done-${role}`);
  }
  if (tone === "green") {
    return variables;
  }
  for (const [role, token] of Object.entries(neutralDone.roles)) {
    variables[`--flows-done-${role}`] = tokenVar(token);
  }
  variables["--flows-node-doneBar"] = tokenVar(neutralDone.cardBar);
  for (const [role, token] of Object.entries(amberWarnings)) {
    variables[`--flows-warnings-${role}`] = tokenVar(token);
  }
  return variables;
};

/**
 * Needs review's alternative (5 Nov: the pale orange reads close to the warnings amber): ?review=alt turns every
 * needs-review role purple, a hue no other state uses. Without it, needs review keeps its pale orange. URL only.
 */
export const reviewTone: "orange" | "alt" =
  new URLSearchParams(globalThis.location.search).get("review") === "alt"
    ? "alt"
    : "orange";

const purpleReview: StateRoles = {
  mark: "purple.s85",
  bar: "purple.s50",
  chart: "purple.s70",
  text: "purple.s110",
  badgeBg: "purple.s20",
  badgeFg: "purple.s110",
};

const reviewToneVariables = (): Record<string, string> => {
  if (reviewTone === "orange") {
    return {};
  }
  const variables: Record<string, string> = {};
  for (const [role, token] of Object.entries(purpleReview)) {
    variables[`--flows-needsReview-${role}`] = tokenVar(token);
  }
  variables["--flows-node-reviewBar"] = tokenVar("purple.s75");
  variables["--flows-node-reviewShift"] = tokenVar("purple.s90");
  return variables;
};

const isPaletteId = (value: string | null): value is PaletteId =>
  value === "today" || value === "o2" || value === "o4";

let current: PaletteId = "o2";
const listeners = new Set<() => void>();

export const currentPalette = () => current;

export const subscribePalette = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Writes the palette's variables (live, no reload). They go on `.petrinaut-root`, the element the
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
  const declarations = Object.entries({
    ...variablesOf(palettes[id]),
    ...doneToneVariables(doneTone),
    ...reviewToneVariables(),
  })
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  sheet.textContent = `.petrinaut-root { ${declarations} }`;
  document.documentElement.dataset.flowsColours = id;
  document.documentElement.dataset.flowsDone = doneTone;
  document.documentElement.dataset.flowsReview = reviewTone;
  for (const listener of listeners) {
    listener();
  }
};

/** At start: ?colours= if the URL names a palette, else O2. */
export const initPalette = () => {
  const fromQuery = new URLSearchParams(globalThis.location.search).get(
    "colours",
  );
  applyPalette(isPaletteId(fromQuery) ? fromQuery : "o2");
};

/** Run-state glyph colours. */
export const statusColor = {
  done: flowsVar("done-mark"),
  failed: flowsVar("failed-mark"),
  running: flowsVar("running-mark"),
  review: flowsVar("needsReview-mark"),
  /** Skipped, abandoned. */
  quiet: flowsVar("skipped-mark"),
  notReached: flowsVar("notRun-mark"),
  /** The empty track of a bar or chart. */
  track: flowsVar("notRun-bar"),
  /** A run completed with warnings: done under ?done=green, amber under ?done=neutral. */
  warnings: flowsVar("warnings-mark"),
  onSolid: "var(--colors-neutral-bg-solid-min)",
} as const;

/** Status text: red for a failure, and so on. */
export const statusText = {
  done: flowsVar("done-text"),
  failed: flowsVar("failed-text"),
  running: flowsVar("running-text"),
  needsReview: flowsVar("needsReview-text"),
  waiting: flowsVar("waiting-text"),
} as const;

/** History's run chart. */
export const chartColor = {
  done: flowsVar("done-chart"),
  failed: flowsVar("failed-chart"),
  running: flowsVar("running-chart"),
  review: flowsVar("needsReview-chart"),
  quiet: flowsVar("skipped-chart"),
  /** Completed with warnings: done under ?done=green, amber under ?done=neutral. */
  warnings: flowsVar("warnings-chart"),
} as const;

/** The 2 px run bar on canvas cards; running pulses. */
export const barColor = {
  done: flowsVar("done-bar"),
  failed: flowsVar("failed-bar"),
  running: flowsVar("running-bar"),
  review: flowsVar("needsReview-bar"),
  skipped: flowsVar("skipped-bar"),
  rest: flowsVar("notRun-bar"),
} as const;

/** Take 1 and 2's card bar: each state two steps above the palette's own bar (today: about s80). */
export const strongBarColor = {
  done: flowsVar("node-doneBar"),
  failed: flowsVar("node-failedBar"),
  running: flowsVar("node-runningBar"),
  review: flowsVar("node-reviewBar"),
  skipped: flowsVar("node-skippedBar"),
  rest: flowsVar("node-restBar"),
} as const;

/** The ?nodeglow= takes: the glassy card's gradient steps and its inner light edge. */
export const glassColor = {
  shade: flowsVar("node-glassShade"),
  drop: flowsVar("node-glassDrop"),
  highlight: flowsVar("node-highlight"),
} as const;

/** ?nodeglow=bar and bar-review: the running sweep and the needs-review shift. */
export const barMotionColor = {
  runningSweep: flowsVar("node-runningSweep"),
  reviewShift: flowsVar("node-reviewShift"),
} as const;

/** Take 3's card bar: colour only where attention is needed; done stays a faint neutral. */
export const quietBarColor = {
  ...strongBarColor,
  done: flowsVar("node-quietDoneBar"),
} as const;

/** Take 4: the faint red outline round a failed card. */
export const failedOutlineColor = flowsVar("node-failedOutline");

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

/**
 * `?pickercolour=` only: the group a step is listed under gives its tile hue wherever the tile shows (canvas, Steps
 * panel, add menu). Keyed by the step's icon, as `tileColor` is; a step in no group keeps its kind tint.
 */
export const groupHues: { group: string; hue: string; icons: string[] }[] = [
  { group: "People", hue: "yellow", icons: ["user"] },
  { group: "Messages", hue: "blue", icons: ["at"] },
  { group: "Documents", hue: "orange", icons: ["download"] },
  {
    group: "Entities",
    hue: "green",
    icons: ["search", "eye", "squarePlus", "pencil"],
  },
  {
    group: "Flow control",
    hue: "purple",
    icons: [
      "diagramSubtask",
      "rotate",
      "filter",
      "bullseye",
      "sortDown",
      "list",
      "function",
    ],
  },
];

const pickerColourFlag = () => {
  const value = Number(
    new URLSearchParams(globalThis.location.search).get("pickercolour"),
  );
  return value >= 1 && value <= 3 ? value : null;
};

/** A group row's icon in its group's hue (`?pickercolour=1`): the step icons' s100, so a group and its steps match. */
export const groupIconColour = (group: string) => {
  const hue = groupHues.find((entry) => entry.group === group)?.hue;
  return hue ? tokenVar(`${hue}.s100`) : undefined;
};

/** A group's small swatch (`?pickercolour=2`). */
export const groupSwatch = (group: string) => {
  const hue = groupHues.find((entry) => entry.group === group)?.hue;
  return hue ? tokenVar(`${hue}.s70`) : undefined;
};

const groupTileColor = (icon: string) => {
  const colour = pickerColourFlag();
  const hue =
    colour === null
      ? undefined
      : groupHues.find((entry) => entry.icons.includes(icon))?.hue;
  if (hue === undefined) {
    return null;
  }
  return {
    backgroundColor: tokenVar(colour === 3 ? "neutral.s20" : `${hue}.s20`),
    color: tokenVar(`${hue}.s100`),
  };
};

/** A tile's background and icon colour, as inline style. `ghost` for the editor's ghost trigger nodes. */
export const tileColor = (icon: string, ghost = false) =>
  ghost
    ? {
        backgroundColor: flowsVar("ghost-tile-bg"),
        color: flowsVar("ghost-tile-icon"),
      }
    : (groupTileColor(icon) ?? {
        backgroundColor: flowsVar(`tile-${tileKindOf(icon)}-bg`),
        color: flowsVar(`tile-${tileKindOf(icon)}-icon`),
      });
