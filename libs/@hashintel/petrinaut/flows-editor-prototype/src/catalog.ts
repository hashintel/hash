/**
 * What the Add node picker offers, and how each step looks. Inputs and outputs come from the engine's action
 * definitions (or the mocks); titles, icons and categories are design choices the engine has no field for.
 */
import { actionDefinitions } from "./engine";
import {
  type EditorPayloadKind,
  isMockActionDefinitionId,
  mockActionDefinitions,
} from "./mock-action-definitions";
import { prdBlocks, type PrdSource } from "./mock-prd-ports";

import type { IconName } from "@hashintel/ds-components";

export type InputView = {
  name: string;
  label: string;
  /** From the draft PRD: the sources the picker offers, and when the input is required. */
  sources?: PrdSource[];
  rule?: string;
  description?: string;
  array: boolean;
  required: boolean;
  hasDefault: boolean;
  /** `null` for an input whose kind comes from another input (`kindFrom`). */
  kinds: readonly EditorPayloadKind[] | null;
  kindFrom?: string;
};

export type OutputView = {
  name: string;
  label: string;
  description?: string;
  array: boolean;
  required: boolean;
  payloadKind?: EditorPayloadKind;
  kindFrom?: string;
  kindDeclaredBy?: string;
};

export type Category =
  | "Entities"
  | "Logic"
  | "AI"
  | "Files and web"
  | "Messages";

/** The groups people browse. AI is parked (ledger, 21 Oct: manual journeys only), so its steps are not offered. */
export const categories: Category[] = [
  "Entities",
  "Logic",
  "Files and web",
  "Messages",
];

/** Whether a step is offered in the picker and the library (its group is browsable). */
export const isOffered = (entry: { category: Category }) =>
  categories.includes(entry.category);

export type Origin =
  | { kind: "engine" }
  | { kind: "open-pr"; pr: number }
  | { kind: "mock"; why: string };

export type CatalogEntry = {
  /** The action definition id, or `forEach` for the group step. */
  id: string;
  title: string;
  description: string;
  category: Category;
  icon: IconName;
  /** D21 grammar: orange for Fetch file, If and Ask a person; green for other actions. */
  tone: "green" | "orange";
  origin: Origin;
  inputs: InputView[];
  outputs: OutputView[];
  /** For a step whose outputs are branches: the outputs drawn as ports, in order. */
  ports?: { outputName: string; label: string }[];
};

export const humanize = (name: string) => {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/Id\b/g, "")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

type Presentation = Pick<CatalogEntry, "title" | "category" | "icon"> & {
  tone?: CatalogEntry["tone"];
  ports?: CatalogEntry["ports"];
};

/**
 * The actions the picker shows, with the team's names for them (Find entities, Fetch file). Actions left out are
 * the research and dashboard actions, which are steps of HASH's own AI flows rather than building blocks.
 */
const presentation: Record<string, Presentation> = {
  queryEntities: {
    title: "Find entities",
    category: "Entities",
    icon: "search",
  },
  readEntity: { title: "Read entity", category: "Entities", icon: "eye" },
  createEntity: {
    title: "Create entity",
    category: "Entities",
    icon: "squarePlus",
  },
  updateEntity: {
    title: "Update entity",
    category: "Entities",
    icon: "pencil",
  },
  if: {
    title: "If",
    category: "Logic",
    icon: "diagramSubtask",
    tone: "orange",
    ports: [
      { outputName: "true", label: "Yes" },
      { outputName: "false", label: "No" },
    ],
  },
  filterList: { title: "Filter list", category: "Logic", icon: "filter" },
  find: { title: "Find in list", category: "Logic", icon: "bullseye" },
  orderBy: { title: "Order by", category: "Logic", icon: "sortDown" },
  takeFirst: { title: "Take first", category: "Logic", icon: "list" },
  aggregate: { title: "Aggregate", category: "Logic", icon: "function" },
  draftMessage: { title: "Draft message", category: "AI", icon: "sparkles" },
  answerQuestion: {
    title: "Answer question",
    category: "AI",
    icon: "thoughtBubble",
  },
  getWebPageSummary: {
    title: "Summarize web page",
    category: "AI",
    icon: "fileLines",
  },
  getFileFromUrl: {
    title: "Fetch file",
    category: "Files and web",
    icon: "download",
    tone: "orange",
  },
  getWebPageByUrl: {
    title: "Get web page",
    category: "Files and web",
    icon: "externalLink",
  },
  webSearch: {
    title: "Web search",
    category: "Files and web",
    icon: "microscope",
  },
  sendEmail: { title: "Send email", category: "Messages", icon: "at" },
  requestReview: {
    title: "Ask a person",
    category: "Messages",
    icon: "user",
    tone: "orange",
    ports: [
      { outputName: "approved", label: "Approved" },
      { outputName: "rejected", label: "Rejected" },
    ],
  },
};

const fromEngine = (id: string): CatalogEntry | null => {
  const look = presentation[id];
  if (!look) {
    return null;
  }

  if (isMockActionDefinitionId(id)) {
    const mock = mockActionDefinitions[id];
    return {
      id,
      ...look,
      tone: look.tone ?? "green",
      description: mock.description,
      origin: mock.origin,
      inputs: mock.inputs.map((input) => ({
        name: input.name,
        label: humanize(input.name),
        description: input.description,
        array: input.array,
        required: input.required,
        hasDefault: !!input.hasDefault,
        kinds: input.oneOfPayloadKinds,
      })),
      outputs: mock.outputs.map((output) => ({
        name: output.name,
        label: humanize(output.name),
        description: output.description,
        array: output.array,
        required: output.required,
        payloadKind: "payloadKind" in output ? output.payloadKind : undefined,
        kindDeclaredBy:
          "kindDeclaredBy" in output ? output.kindDeclaredBy : undefined,
      })),
    };
  }

  const definition = (
    actionDefinitions as unknown as Record<
      string,
      (typeof actionDefinitions)["if"] | undefined
    >
  )[id];
  if (!definition) {
    return null;
  }

  return {
    id,
    ...look,
    tone: look.tone ?? "green",
    description: definition.description,
    origin: { kind: "engine" },
    inputs: definition.inputs.map((input) => ({
      name: input.name,
      label: humanize(input.name),
      description: input.description,
      array: input.array,
      required: input.required,
      hasDefault: input.default !== undefined,
      kinds: "oneOfPayloadKinds" in input ? input.oneOfPayloadKinds : null,
      kindFrom: "kindFrom" in input ? input.kindFrom : undefined,
    })),
    outputs: definition.outputs.map((output) => ({
      name: output.name,
      label: humanize(output.name),
      description: output.description,
      array: output.array,
      required: output.required,
      payloadKind: "payloadKind" in output ? output.payloadKind : undefined,
      kindFrom: "kindFrom" in output ? output.kindFrom : undefined,
    })),
  };
};

export const forEachEntry: CatalogEntry = {
  id: "forEach",
  title: "For each",
  description:
    "Run the steps inside once per item of a list, in parallel, and collect one output from every item.",
  category: "Logic",
  icon: "rotate",
  tone: "green",
  origin: { kind: "engine" },
  inputs: [],
  outputs: [],
};

/** Lays the draft PRD's port names, descriptions, sources and rules over the engine's inputs and outputs. */
const withPrdPorts = (entry: CatalogEntry): CatalogEntry => {
  const prd = prdBlocks[entry.id];
  if (!prd) {
    return entry;
  }
  return {
    ...entry,
    inputs: entry.inputs.map((input) => {
      const port = prd.inputs[input.name];
      return port
        ? {
            ...input,
            label: port.label,
            description: port.description,
            sources: port.sources,
            rule: port.rule,
          }
        : input;
    }),
    outputs: entry.outputs.map((output) => {
      const port = prd.outputs[output.name];
      return port
        ? { ...output, label: port.label, description: port.description }
        : output;
    }),
  };
};

export const catalog: CatalogEntry[] = [
  ...Object.keys(presentation).flatMap((id) => {
    const entry = fromEngine(id);
    return entry ? [withPrdPorts(entry)] : [];
  }),
  forEachEntry,
];

export const getCatalogEntry = (id: string): CatalogEntry | undefined =>
  catalog.find((entry) => entry.id === id);

/**
 * "Recommended" on an empty flow: popular first steps (Dei, 20 Oct). The real rule belongs in a PRD; this list is
 * a stand-in.
 */
export const popularFirstSteps = ["queryEntities", "readEntity", "forEach"];
