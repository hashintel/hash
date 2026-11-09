import type { CSSProperties } from "react";

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

/**
 * `?statusstep=b|c|d` (inbox status-colour-steps, open): how loud done, failed, needs review and warnings read beside
 * the P-a tiles. Unset or `a` is O2 as it is. Round 2 (5 Nov: "i literally see no difference", then "calmer and more
 * subtle only") steps down from today: b one step quieter, marks and bars; c two steps quieter, bars near the tile
 * tints; d c's steps with the hue softened 40% toward grey and 1 px card bars.
 * Warnings take yellow in b–d.
 */
type StatusStep = "b" | "c" | "d";

export const statusStep = (): StatusStep | null => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "statusstep",
  );
  return value === "b" || value === "c" || value === "d" ? value : null;
};

const statusSteps: Record<
  "b" | "c" | "d",
  Record<
    "done" | "failed" | "needsReview" | "warnings",
    { mark: string; bar: string; chart: string; node: string }
  >
> = {
  // b: one step quieter than today, marks and bars.
  b: {
    done: { mark: "green.s75", bar: "green.s40", chart: "green.s50", node: "green.s55" },
    failed: { mark: "red.s80", bar: "red.s45", chart: "red.s50", node: "red.s60" },
    needsReview: { mark: "orange.s75", bar: "orange.s40", chart: "orange.s50", node: "orange.s55" },
    warnings: { mark: "yellow.s80", bar: "yellow.s45", chart: "yellow.s60", node: "yellow.s60" },
  },
  // c: two steps quieter, bars near the tile tints.
  c: {
    done: { mark: "green.s70", bar: "green.s30", chart: "green.s40", node: "green.s45" },
    failed: { mark: "red.s70", bar: "red.s35", chart: "red.s40", node: "red.s50" },
    needsReview: { mark: "orange.s70", bar: "orange.s30", chart: "orange.s40", node: "orange.s45" },
    warnings: { mark: "yellow.s75", bar: "yellow.s40", chart: "yellow.s55", node: "yellow.s55" },
  },
  // d: c's steps with the hue softened toward grey (see softened), and 1 px card bars.
  d: {
    done: { mark: "green.s70", bar: "green.s30", chart: "green.s40", node: "green.s45" },
    failed: { mark: "red.s70", bar: "red.s35", chart: "red.s40", node: "red.s50" },
    needsReview: { mark: "orange.s70", bar: "orange.s30", chart: "orange.s40", node: "orange.s45" },
    warnings: { mark: "yellow.s75", bar: "yellow.s40", chart: "yellow.s55", node: "yellow.s55" },
  },
};

/** A token mixed toward the neutral of the same step, keeping `keep` of its own hue. */
const softened = (token: string, keep = 60) =>
  `color-mix(in oklab, ${tokenVar(token)} ${keep}%, ${tokenVar(`neutral.${token.split(".")[1] ?? "s70"}`)})`;

/** `?statusstep=d` thins the card bars from 2 px to 1 px; null keeps the bar's own height. */
export const statusBarHeight = () => (statusStep() === "d" ? 1 : null);

const statusStepVariables = (): Record<string, string> => {
  const step = statusStep();
  if (!step) {
    return {};
  }
  const variables: Record<string, string> = {};
  const nodeRole = { done: "doneBar", failed: "failedBar", needsReview: "reviewBar" } as const;
  const paint = step === "d" ? softened : tokenVar;
  for (const [state, roles] of Object.entries(statusSteps[step])) {
    variables[`--flows-${state}-mark`] = paint(roles.mark);
    variables[`--flows-${state}-chart`] = paint(roles.chart);
    if (state !== "warnings") {
      variables[`--flows-${state}-bar`] = paint(roles.bar);
      variables[`--flows-node-${nodeRole[state as keyof typeof nodeRole]}`] = paint(roles.node);
    }
  }
  return variables;
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
    ...statusStepVariables(),
  })
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  sheet.textContent = `.petrinaut-root { ${declarations} } ${runTileVariables}`;
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

/**
 * `?palette=a..d` (add-picker card, 5 Nov): which hue each group takes, at DS steps of equal perceived lightness — tile
 * L* ≈ 96, icon L* ≈ 49, so no hue reads weaker than another (the s20 / s100 yellow was 1.3:1, near invisible).
 * a: meaning (people yellow, messages blue, documents orange, entities green, flow control purple);
 * b: clear of the run-state hues (pink, purple, yellow, then neutral);
 * c: a's hues on the icon only, on a neutral tile;
 * d: colour only where it matters (people pink, flow control purple), the rest neutral.
 * A palette turns the group colours on as `?pickercolour=1` does.
 */
const equalSteps: Record<string, { tile: string; icon: string }> = {
  yellow: { tile: "yellow.s35", icon: "yellow.s110" },
  blue: { tile: "blue.s25", icon: "blue.s110" },
  orange: { tile: "orange.s25", icon: "orange.s110" },
  green: { tile: "green.s25", icon: "green.s110" },
  purple: { tile: "purple.s25", icon: "purple.s90" },
  pink: { tile: "pink.s25", icon: "pink.s100" },
  neutral: { tile: "neutral.s25", icon: "neutral.s105" },
};

const meaning: Record<string, string> = {
  People: "yellow",
  Messages: "blue",
  Documents: "orange",
  Entities: "green",
  "Flow control": "purple",
};

export const groupPalettes: Record<
  "a" | "b" | "c" | "d",
  Record<string, string>
> = {
  a: meaning,
  b: {
    People: "pink",
    Messages: "purple",
    Documents: "yellow",
    Entities: "neutral",
    "Flow control": "neutral",
  },
  c: meaning,
  d: {
    People: "pink",
    Messages: "neutral",
    Documents: "neutral",
    Entities: "neutral",
    "Flow control": "purple",
  },
};

/**
 * P-a is the default (Aakarsh's provisional pick on add-picker, 5 Nov; may be revisited). `?palette=b|c|d` shows the
 * other takes, `?palette=today` the kind tints from before, and an explicit `?pickercolour=` its own take.
 */
export const pickerPalette = (): "a" | "b" | "c" | "d" | null => {
  const query = new URLSearchParams(globalThis.location.search);
  const value = query.get("palette");
  if (value === "a" || value === "b" || value === "c" || value === "d") {
    return value;
  }
  return value === "today" || query.has("pickercolour") ? null : "a";
};

/**
 * With a palette, tiles are neutral in the run view and Logs: `app.tsx` marks the root `data-run-tiles` there, and
 * `applyPalette` points these variables at the neutral steps under it.
 */
const runTile = (property: "bg" | "icon", colour: string) =>
  pickerPalette() && !circleTiles ? `var(--flows-run-tile-${property}, ${colour})` : colour;

const runTileVariables = `.petrinaut-root[data-run-tiles] { --flows-run-tile-bg: ${tokenVar("neutral.s25")}; --flows-run-tile-icon: ${tokenVar("neutral.s105")}; }`;

/** A group's tile and icon tokens in the `?palette=` take, or null without one. */
const paletteSwatch = (group: string) => {
  const palette = pickerPalette();
  const hue = palette ? groupPalettes[palette][group] : undefined;
  const steps = hue ? equalSteps[hue] : undefined;
  if (!palette || !steps) {
    return null;
  }
  if (circleTiles) {
    return circleSteps[hue!] ?? steps;
  }
  return palette === "c" ? { tile: "neutral.s25", icon: steps.icon } : steps;
};

/** `?grouprow=1`: a group row's faint tint, its palette tile step (or the s20 step without a palette). */
export const groupRowColour = (group: string) => {
  const swatch = paletteSwatch(group);
  if (swatch) {
    return swatch.tile === "neutral.s25" ? undefined : tokenVar(swatch.tile);
  }
  const hue = groupHues.find((entry) => entry.group === group)?.hue;
  return hue ? tokenVar(`${hue}.s20`) : undefined;
};

const pickerColourFlag = () => {
  const value = Number(
    new URLSearchParams(globalThis.location.search).get("pickercolour"),
  );
  return value >= 1 && value <= 3 ? value : pickerPalette() ? 1 : null;
};

/** A group row's icon in its group's hue (`?pickercolour=1`): the step icons' s100, so a group and its steps match. */
export const groupIconColour = (group: string) => {
  const swatch = paletteSwatch(group);
  if (swatch) {
    return tokenVar(swatch.icon);
  }
  const hue = groupHues.find((entry) => entry.group === group)?.hue;
  return hue ? tokenVar(`${hue}.s100`) : undefined;
};

/** A group's small swatch (`?pickercolour=2`). */
export const groupSwatch = (group: string) => {
  const swatch = paletteSwatch(group);
  if (swatch) {
    return tokenVar(swatch.icon);
  }
  const hue = groupHues.find((entry) => entry.group === group)?.hue;
  return hue ? tokenVar(`${hue}.s70`) : undefined;
};

const groupTileColor = (icon: string) => {
  const group = groupHues.find((entry) => entry.icons.includes(icon))?.group;
  const swatch = group ? paletteSwatch(group) : null;
  if (swatch) {
    return {
      backgroundColor: runTile("bg", tokenVar(swatch.tile)),
      color: runTile("icon", tokenVar(swatch.icon)),
    };
  }
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
/**
 * `?tileshape=circle` (inbox tile-circles, 9 Nov sync): every step icon tile is a circle instead of a rounded square,
 * in the Steps tree, canvas cards, menus, the panel header and Used in. Read from the URL only; unset is today's square.
 */
export const circleTiles =
  new URLSearchParams(globalThis.location.search).get("tileshape") === "circle";

/**
 * Under `?tileshape=circle` (Aakarsh, 9 Nov: no grey tile backgrounds anywhere): the DS chip pairing, bg/shaded s20
 * with fg/icon/max s90, in the editor and the run view alike. Yellow keeps its s110 icon on s30, as yellow s90 is lemon
 * on s20 (1.2:1). Steps in no group get no tile, only a neutral icon.
 */
const circleSteps: Record<string, { tile: string; icon: string }> = {
  orange: { tile: "orange.s20", icon: "orange.s90" },
  green: { tile: "green.s20", icon: "green.s90" },
  blue: { tile: "blue.s20", icon: "blue.s90" },
  purple: { tile: "purple.s20", icon: "purple.s90" },
  pink: { tile: "pink.s20", icon: "pink.s90" },
  yellow: { tile: "yellow.s30", icon: "yellow.s110" },
};

/**
 * `?panelcircle=16-9|18-10|20-11` (circle/icon px) and `?panelstroke=1`: the circle in the Steps tree, run left panel
 * and Used in rows, with more room around the icon. Unset under `?tileshape=circle` is 18-10.
 */
const panelCircle = (() => {
  const query = new URLSearchParams(globalThis.location.search);
  const [size, icon] = (query.get("panelcircle") ?? "18-10").split("-").map(Number);
  return {
    size: size && size >= 12 && size <= 24 ? size : 18,
    icon: icon && icon >= 8 && icon <= 16 ? icon : 10,
    stroke: query.get("panelstroke") === "1" ? 1 : 1.25,
  };
})();

if (circleTiles && typeof document !== "undefined") {
  const sheet = document.createElement("style");
  const { icon, stroke } = panelCircle;
  sheet.textContent = `[style*="--panel-circle"] svg { width: ${icon}px !important; height: ${icon}px !important; min-width: ${icon}px !important; --icon-size: ${icon}px; stroke-width: ${stroke} !important; }`;
  document.head.append(sheet);
}

const shaped = (style: CSSProperties, panel = false): CSSProperties =>
  circleTiles
    ? {
        ...style,
        borderRadius: "9999px",
        ...(panel
          ? ({
              width: `${panelCircle.size}px`,
              height: `${panelCircle.size}px`,
              "--panel-circle": "1",
            } as CSSProperties)
          : {}),
      }
    : style;

const tileColorOf = (icon: string, ghost = false): CSSProperties =>
  ghost
    ? {
        backgroundColor: flowsVar("ghost-tile-bg"),
        color: flowsVar("ghost-tile-icon"),
      }
    : (groupTileColor(icon) ??
      (circleTiles ? { backgroundColor: "transparent", color: tokenVar("neutral.s105") } : null) ?? {
        backgroundColor: runTile("bg", flowsVar(`tile-${tileKindOf(icon)}-bg`)),
        color: runTile("icon", flowsVar(`tile-${tileKindOf(icon)}-icon`)),
      });

/**
 * The right panel's header tile (H4, decided 5 Nov): the step's group hue at the canvas tiles' equal steps, in the
 * editor and the run view alike, so it skips the run view's neutral tiles. Icons outside a group stay neutral.
 */
export const tileColor = (icon: string, ghost = false): CSSProperties =>
  shaped(tileColorOf(icon, ghost));

export const panelTileColor = (icon: string): CSSProperties => {
  const group = groupHues.find((entry) => entry.icons.includes(icon))?.group;
  const steps = (group ? paletteSwatch(group) : null) ?? equalSteps.neutral!;
  return shaped({ backgroundColor: tokenVar(steps.tile), color: tokenVar(steps.icon) });
};

/**
 * `?treetiles=b|c|d` (inbox status-colour-steps, open): the Steps tree's tiles apart from the canvas and Add menu.
 * Unset or `a` is P-a everywhere, as now. b: neutral tree tiles (the 2 Nov rule); c: the group hue on the icon only,
 * on a neutral tile (P-c); d: P-a one step fainter (tile s15, yellow s20; icon one step lighter). Under P-a the run
 * view still makes them neutral unless `?runtiles=pa`.
 * d1..d4 keep the P-a hues, quieter. d1: tile one step fainter (s20; yellow s20 too, as its s30 has 8× the others'
 * chroma), icon as P-a; d2: tile and icon one step fainter each, icons held at ≥ 3:1 on white (yellow has no lighter
 * step that passes, so People keeps s110); d3: tile nearly white (s10, yellow s15), the hue carried by the icon;
 * d4: no fill, a faint 1 px hue ring.
 */
const fainterIcon: Record<string, string> = {
  yellow: "yellow.s105",
  blue: "blue.s100",
  orange: "orange.s100",
  green: "green.s100",
  purple: "purple.s80",
};

const fainterTile: Record<string, string> = {
  yellow: "yellow.s20",
  blue: "blue.s20",
  orange: "orange.s20",
  green: "green.s20",
  purple: "purple.s20",
};

const fainterReadableIcon: Record<string, string> = {
  yellow: "yellow.s110",
  blue: "blue.s105",
  orange: "orange.s105",
  green: "green.s105",
  purple: "purple.s85",
};

const quieterTree: Record<string, (hue: string) => CSSProperties> = {
  d1: (hue) => ({
    backgroundColor: runTile("bg", tokenVar(fainterTile[hue] ?? "neutral.s20")),
    color: runTile("icon", tokenVar(equalSteps[hue]?.icon ?? "neutral.s105")),
  }),
  d2: (hue) => ({
    backgroundColor: runTile("bg", tokenVar(fainterTile[hue] ?? "neutral.s20")),
    color: runTile("icon", tokenVar(fainterReadableIcon[hue] ?? "neutral.s105")),
  }),
  d3: (hue) => ({
    backgroundColor: runTile("bg", tokenVar(hue === "yellow" ? "yellow.s15" : `${hue}.s10`)),
    color: runTile("icon", tokenVar(equalSteps[hue]?.icon ?? "neutral.s105")),
  }),
  d4: (hue) => ({
    backgroundColor: runTile("bg", "transparent"),
    boxShadow: `inset 0 0 0 1px ${runTile("bg", tokenVar(hue === "yellow" ? "yellow.s55" : `${hue}.s45`))}`,
    color: runTile("icon", tokenVar(equalSteps[hue]?.icon ?? "neutral.s105")),
  }),
};

export const treeTileColor = (icon: string): CSSProperties =>
  shaped(treeTileColorOf(icon), true);

const treeTileColorOf = (icon: string): CSSProperties => {
  const take = new URLSearchParams(globalThis.location.search).get("treetiles");
  const hue = groupHues.find((entry) => entry.icons.includes(icon))?.hue;
  const quieter = take ? quieterTree[take] : undefined;
  if (quieter && hue && pickerPalette() === "a") {
    return quieter(hue);
  }
  if (take !== "b" && take !== "c" && take !== "d") {
    return tileColor(icon);
  }
  const neutral = {
    backgroundColor: runTile("bg", flowsVar(`tile-${tileKindOf(icon)}-bg`)),
    color: runTile("icon", flowsVar(`tile-${tileKindOf(icon)}-icon`)),
  };
  if (take === "b" || !hue) {
    return neutral;
  }
  if (take === "c") {
    return {
      backgroundColor: runTile("bg", tokenVar("neutral.s25")),
      color: runTile("icon", tokenVar(equalSteps[hue]?.icon ?? "neutral.s105")),
    };
  }
  return {
    backgroundColor: runTile("bg", tokenVar(hue === "yellow" ? "yellow.s20" : `${hue}.s15`)),
    color: runTile("icon", tokenVar(fainterIcon[hue] ?? "neutral.s105")),
  };
};
