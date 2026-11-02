import {
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
}

interface BrowserToolDescriptor extends BrowserToolFacts {
  /** Parses the issued input; the browser compares the model's and the issued input parsed. */
  readonly inputSchema: { readonly parse: (input: unknown) => unknown };
}

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
  const { capability, targets } = petrinautToolEffects[name];
  return {
    ...(capability === "petrinaut-mutation" ||
    capability === "petrinaut-command"
      ? changes
      : reads),
    observesNet: name === getLatestNetDefinitionToolName,
    targets,
    inputSchema: petrinautAiTools[name].inputSchema,
  };
};

/** HASH's process page reads the graph as the signed-in user, not the net, and the result is rendered as compact text. */
const hashGraphRead = (
  parse: (input: unknown) => unknown,
): BrowserToolDescriptor => ({
  ...reads,
  runsOnNet: false,
  textResult: true,
  inputSchema: { parse },
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
    // Each does what its canonical operation does, under its own input.
    ...Object.entries(hashPetrinautTools).map(
      ([name, { operation, inputSchema }]): [string, BrowserToolDescriptor] => [
        name,
        { ...canonical(operation), inputSchema },
      ],
    ),
    ...Object.values(netReaderToolNames).map(
      (name): [string, BrowserToolDescriptor] => [
        name,
        {
          ...reads,
          observesNet: true,
          inputSchema: { parse: parseNetReaderInput },
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
        inputSchema: zDraftPetrinautExperimentInput,
      },
    ],
    [brunchTools.queryHashEntities, hashGraphRead(parseHashEntityReadInput)],
    [
      brunchTools.queryHashEntityTypes,
      hashGraphRead(parseHashEntityTypeReadInput),
    ],
    [brunchTools.queryHashWebs, hashGraphRead(parseHashWebReadInput)],
    [
      brunchTools.saveHashNet,
      {
        ...changes,
        // HASH's process page runs it through its editor's Save, which writes
        // the open net as a new version and leaves the net as it was: it is
        // held to the model's last view and a stopped save's effect is
        // unknown, but any change while it was pending is someone else's.
        runsOnNet: false,
        documentRevision: "none",
        inputSchema: { parse: parseHashSaveInput },
      },
    ],
  ]);

export const browserExecutedToolNames: ReadonlySet<string> = new Set(
  browserExecutedTools.keys(),
);

/** What each decision needs to know of a tool; an unknown tool counts as a possible change. */
export const browserToolFacts = (toolName: string): BrowserToolFacts =>
  browserExecutedTools.get(toolName) ?? unknownTool;
