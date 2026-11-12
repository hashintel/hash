/**
 * The inbox cards still open (status open or revise), each with the URL flag that shows its options. The ⌘K jumper
 * lists them under "Open decisions". An option with `value: null` is the page with no param.
 */
export type OpenOption = { label: string; value: string | null };

export type OpenSwitch = {
  card: string;
  title: string;
  flag: string;
  defaultValue: string | null;
  options: OpenOption[];
};

export const openDecisions: OpenSwitch[] = [
  {
    card: "paths-no-rail",
    title: "If and Switch · paths",
    flag: "paths",
    defaultValue: null,
    options: [
      { label: "groups (B, picked)", value: null },
      { label: "rail", value: "rail" },
    ],
  },
  {
    card: "condition-panels-layout",
    title: "If, Switch and Find entities · layout",
    flag: "switchlayout",
    defaultValue: null,
    options: [
      { label: "today", value: null },
      { label: "a", value: "a" },
      { label: "b", value: "b" },
      { label: "c", value: "c" },
    ],
  },
  {
    card: "condition-panels-layout",
    title: "If, Switch and Find entities · joiner",
    flag: "joiner",
    defaultValue: null,
    options: [
      { label: "today", value: null },
      { label: "j1", value: "j1" },
      { label: "j2", value: "j2" },
      { label: "j3", value: "j3" },
    ],
  },
  {
    card: "foreach-run-items",
    title: "For each in a run · items",
    flag: "foreachswitch",
    defaultValue: null,
    options: [
      { label: "runlike", value: null },
      { label: "today", value: "today" },
      { label: "runlike-b", value: "runlike-b" },
      { label: "arrows", value: "arrows" },
      { label: "dropdown", value: "dropdown" },
      { label: "toggle", value: "toggle" },
    ],
  },
  {
    card: "needs-review",
    title: "Needs review · where it opens",
    flag: "needsreview",
    defaultValue: null,
    options: [
      { label: "r2-2", value: null },
      { label: "none", value: "today" },
      { label: "r2-1", value: "r2-1" },
      { label: "r2-3", value: "r2-3" },
      { label: "r2-4", value: "r2-4" },
      { label: "popout", value: "popout" },
      { label: "link", value: "link" },
    ],
  },
  {
    card: "outputs-container",
    title: "Outputs in a run · where they open",
    flag: "outputs",
    defaultValue: null,
    options: [
      { label: "inline + expand", value: null },
      { label: "modal", value: "modal" },
      { label: "inline", value: "inline" },
    ],
  },
  {
    card: "outputs-viewer",
    title: "Outputs in a run · list of files",
    flag: "stepoutputs",
    defaultValue: null,
    options: [
      { label: "a", value: null },
      { label: "b", value: "b" },
      { label: "c", value: "c" },
      { label: "d", value: "d" },
    ],
  },
  {
    card: "schedule-form-layout",
    title: "Schedule form · less dense",
    flag: "scheduleform",
    defaultValue: null,
    options: [
      { label: "today", value: null },
      { label: "a", value: "a" },
      { label: "b", value: "b" },
      { label: "c", value: "c" },
    ],
  },
  {
    card: "trigger-add",
    title: "Triggers page · add a trigger",
    flag: "triggeradd",
    defaultValue: null,
    options: [
      { label: "closed", value: null },
      { label: "g1", value: "g1" },
      { label: "g2", value: "g2" },
      { label: "as drawn", value: "1" },
    ],
  },
  {
    card: "triggers-page",
    title: "Triggers page · layout",
    flag: "triggerspage",
    defaultValue: "2",
    options: [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" },
    ],
  },
  {
    card: "used-in-minimal",
    title: "Used in · at rest",
    flag: "usedin",
    defaultValue: null,
    options: [
      { label: "r2", value: null },
      { label: "r1", value: "r1" },
      { label: "r3", value: "r3" },
      { label: "u1", value: "u1" },
      { label: "u2", value: "u2" },
      { label: "T1 + K3", value: "t1" },
    ],
  },
  {
    card: "used-in-row-spacing",
    title: "Used in list · more air",
    flag: "usedrows",
    defaultValue: null,
    options: [
      { label: "b", value: null },
      { label: "today", value: "today" },
      { label: "a", value: "a" },
      { label: "c", value: "c" },
    ],
  },
  {
    card: "used-in-row-spacing",
    title: "Used in list · align",
    flag: "usedalign",
    defaultValue: null,
    options: [
      { label: "today", value: null },
      { label: "flush with the type icon", value: "flush" },
    ],
  },
  {
    card: "used-in-row-spacing",
    title: "Used in list · input name",
    flag: "usedprop",
    defaultValue: null,
    options: [
      { label: "chevron", value: null },
      { label: "muted text on the right", value: "right" },
      { label: "pill", value: "pill" },
      { label: "dotted leader", value: "leader" },
      { label: "chevron + rail", value: "rail" },
    ],
  },
  {
    card: "conv-status-mark-side",
    title: "Run lists · status mark side",
    flag: "statusside",
    defaultValue: null,
    options: [
      { label: "today", value: null },
      { label: "all left", value: "left" },
      { label: "all right", value: "right" },
    ],
  },
  {
    card: "repeats-trim",
    title: "Repeated facts · trim",
    flag: "repeats",
    defaultValue: null,
    options: [
      { label: "today", value: null },
      { label: "trim", value: "trim" },
    ],
  },
];

/** Every flag above, so a page change keeps them and Reset all clears them. */
export const openDecisionFlags = [
  ...new Set(openDecisions.map((decision) => decision.flag)),
];
