import {
  createExperimentToolName,
  getLatestNetDefinitionToolName,
  petrinautAiTools,
  type PetrinautAiToolName,
} from "@hashintel/petrinaut-core/ai";

import { brunchTools } from "../constants";
import {
  parseHashEntityReadInput,
  parseHashEntityTypeReadInput,
  parseHashWebReadInput,
} from "../hash/graph-reads";
import { hashPetrinautTools } from "../hash/petrinaut-tools";
import { parseHashSaveInput } from "../hash/save";
import { zDraftPetrinautExperimentInput } from "./draft-experiment";
import { netReaderToolNames, parseNetReaderInput } from "./net-readers";
import {
  type NetElementKind,
  petrinautToolEffects,
} from "./petrinaut-tool-effects";

/** What each decision about a browser-executed tool needs to know of it. */
interface BrowserToolFacts {
  /** Run by Petrinaut's automatic in-band tools; otherwise claimed by an interactive card. */
  readonly automatic: boolean;
  /** A call Petrinaut runs on the net, which change attribution and `query_basis` read. */
  readonly runsOnNet: boolean;
  /** Issued only against the model's last view of the net. */
  readonly requiresFreshView: boolean;
  /** A claimed call that fails or stops may have had an effect. */
  readonly effectUnknownOnFailure: boolean;
  /**
   * What its settled result records of the bound document: nothing; the
   * revision it started from; or that, and, when the document moved, the
   * revision it produced with the net read back.
   */
  readonly documentRevision: "none" | "before" | "change";
  /** A successful result shows the model the net as it stands. */
  readonly observesNet: boolean;
  /** Its output is already text rendered for the model. */
  readonly textResult: boolean;
  /** Element kinds whose meaning a change it makes can change, and so whose IDs it can name. */
  readonly targets: readonly NetElementKind[];
  /** It removes what the user built, so the user approves each call first. */
  readonly destructive: boolean;
  /**
   * Once started it has read what it needs of the net, so later calls in the
   * same step needn't wait for it to finish; a started run still reports a
   * failure after Stop.
   */
  readonly releasesDocumentLane: boolean;
}

/** One canonical Petrinaut call a tool's call makes. */
export interface CanonicalPetrinautCall {
  readonly toolName: string;
  readonly input: unknown;
}

interface BrowserToolDescriptor extends BrowserToolFacts {
  /** Parses the issued input; the browser compares the model's and the issued input parsed. */
  readonly inputParser: { readonly parse: (input: unknown) => unknown };
  /** The canonical Petrinaut calls a call with this input makes, in order; none for other tools. */
  readonly canonicalCalls: (
    input: unknown,
  ) => readonly CanonicalPetrinautCall[];
}

const noCanonicalCalls = (): readonly CanonicalPetrinautCall[] => [];

/** A tool that reads, or prepares in editor memory, and leaves the document as it was. */
const reads: BrowserToolFacts = {
  automatic: true,
  runsOnNet: true,
  requiresFreshView: false,
  effectUnknownOnFailure: false,
  documentRevision: "before",
  observesNet: false,
  textResult: false,
  targets: [],
  destructive: false,
  releasesDocumentLane: false,
};

/** A tool that may change the bound document. */
const changes: BrowserToolFacts = {
  ...reads,
  requiresFreshView: true,
  effectUnknownOnFailure: true,
  documentRevision: "change",
};

/**
 * An unknown tool's effect is unknown, so it counts as a possible change; the
 * browser never runs it.
 */
const unknownTool: BrowserToolFacts = {
  ...changes,
  automatic: false,
  runsOnNet: false,
};

const canonical = (name: PetrinautAiToolName): BrowserToolDescriptor => {
  const { capability, targets, destructive } = petrinautToolEffects[name];
  return {
    ...(capability === "petrinaut-mutation" ||
    capability === "petrinaut-command"
      ? changes
      : reads),
    observesNet: name === getLatestNetDefinitionToolName,
    // An experiment runs on the snapshot it captured as it started.
    releasesDocumentLane: name === createExperimentToolName,
    targets,
    destructive,
    inputParser: petrinautAiTools[name].inputSchema,
    canonicalCalls: (input) => [{ toolName: name, input }],
  };
};

/**
 * One of HASH's Petrinaut tools: a change, which can change what its
 * operations can and is destructive when any of them is.
 */
/**
 * One of HASH's Petrinaut tools: what its first canonical operation is (every
 * operation of a merged update is a mutation), able to change what its
 * operations can, and destructive when any of them is.
 */
const hashPetrinaut = ({
  operations,
  zInput,
  parseCall,
}: (typeof hashPetrinautTools)[keyof typeof hashPetrinautTools]): BrowserToolDescriptor => {
  const [first] = operations;
  const effects = operations.map(
    (operation) => petrinautToolEffects[operation],
  );
  return {
    ...canonical(first),
    targets: [...new Set(effects.flatMap(({ targets }) => targets))],
    destructive: effects.some(({ destructive }) => destructive),
    inputParser: zInput,
    canonicalCalls: (input) => parseCall(input).calls,
  };
};

/** HASH's process page reads the graph as the signed-in user, not the net, and the result is rendered as compact text. */
const hashGraphRead = (
  parse: (input: unknown) => unknown,
): BrowserToolDescriptor => ({
  ...reads,
  runsOnNet: false,
  textResult: true,
  inputParser: { parse },
  canonicalCalls: noCanonicalCalls,
});

/**
 * Every tool the server issues to the bound browser and awaits in band:
 * Petrinaut's canonical tools, HASH's Petrinaut tools over them, the filtered
 * net readers, the reviewed experiment draft, HASH's graph reads and HASH's
 * Save.
 */
export const browserExecutedTools: ReadonlyMap<string, BrowserToolDescriptor> =
  new Map<string, BrowserToolDescriptor>([
    ...(Object.keys(petrinautAiTools) as PetrinautAiToolName[]).map(
      (name): [string, BrowserToolDescriptor] => [name, canonical(name)],
    ),
    // Each does what its canonical operations do, under its own input.
    ...Object.entries(hashPetrinautTools).map(
      ([name, tool]): [string, BrowserToolDescriptor] => [
        name,
        hashPetrinaut(tool),
      ],
    ),
    ...Object.values(netReaderToolNames).map(
      (name): [string, BrowserToolDescriptor] => [
        name,
        {
          ...reads,
          observesNet: true,
          inputParser: { parse: parseNetReaderInput },
          canonicalCalls: noCanonicalCalls,
        },
      ],
    ),
    [
      brunchTools.draftPetrinautExperiment,
      {
        ...reads,
        // Prepared in editor memory through its own review card.
        automatic: false,
        runsOnNet: false,
        inputParser: zDraftPetrinautExperimentInput,
        canonicalCalls: noCanonicalCalls,
      },
    ],
    [brunchTools.hashQueryEntities, hashGraphRead(parseHashEntityReadInput)],
    [
      brunchTools.hashQueryEntityTypes,
      hashGraphRead(parseHashEntityTypeReadInput),
    ],
    [brunchTools.hashQueryWebs, hashGraphRead(parseHashWebReadInput)],
    [
      brunchTools.appSaveNet,
      {
        ...changes,
        // HASH's process page runs it through its editor's Save, which writes
        // the open net as a new version and leaves the net as it was: it is
        // held to the model's last view and a stopped save's effect is
        // unknown, but any change while it was pending is someone else's.
        runsOnNet: false,
        documentRevision: "none",
        inputParser: { parse: parseHashSaveInput },
        canonicalCalls: noCanonicalCalls,
      },
    ],
  ]);

export const browserExecutedToolNames: ReadonlySet<string> = new Set(
  browserExecutedTools.keys(),
);

/** What each decision needs to know of a tool; an unknown tool counts as a possible change. */
export const browserToolFacts = (toolName: string): BrowserToolFacts =>
  browserExecutedTools.get(toolName) ?? unknownTool;

/**
 * The canonical Petrinaut calls a call of `toolName` with `input` makes, in
 * order: itself for a canonical tool, its operations for one of HASH's
 * Petrinaut tools, and none otherwise. Throws on an input the tool doesn't
 * accept.
 */
export const canonicalCallsOf = (
  toolName: string,
  input: unknown,
): readonly CanonicalPetrinautCall[] =>
  browserExecutedTools.get(toolName)?.canonicalCalls(input) ?? [];
