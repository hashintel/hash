/**
 * @role The Brunch-named Petrinaut tools the browser answers, wrapping canonical
 *   Petrinaut capabilities under Brunch's own names without renaming them.
 *
 * Brunch mounts `read_petrinaut_docs`, `read_petrinaut_net`,
 * `read_petrinaut_diagnostics`, `layout_petrinaut_net` and
 * `mutate_petrinaut_net` on the server; the browser owns their execution. Each
 * wrapper runs the same operation the stock assistant tool would, and every
 * wrapper passes through one durability barrier: when a tool changes the
 * document, its result is not returned until the host has settled that
 * revision, so a reported success implies the change was stored.
 */
import {
  layoutPetrinautNetToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
  type BrowserBinding,
  type ConstructionMutationAttempt,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  aiCommandActionInputSchemas,
  readPetrinautDocToolInputSchema,
  resolvePetrinautHandleCapabilities,
  type DocumentRevisionId,
} from "@hashintel/petrinaut-core";
import {
  petrinautDocsContent,
  type PetrinautAiAutomaticTool,
  type PetrinautAiAutomaticToolExecuteParams,
} from "@hashintel/petrinaut/ui";

import {
  createMutatePetrinetAutomaticTool,
  type MutatePetrinetOperationFailure,
} from "./mutate-petrinet-tool";
import { observeBrowserDefinition } from "./mutation-record";

const passthrough = { parse: (value: unknown) => value };

const readDocsTool: PetrinautAiAutomaticTool = {
  toolName: READ_PETRINAUT_DOCS_TOOL_NAME,
  inputSchema: readPetrinautDocToolInputSchema,
  outputSchema: passthrough,
  execute: ({ input }) => {
    const { doc } = readPetrinautDocToolInputSchema.parse(input);
    return petrinautDocsContent[doc];
  },
};

/**
 * The same `{ title, definition, extensions }` the stock net read returns,
 * read from the live handle the mutation recorder independently observes so
 * the transport's verification compares like with like.
 */
const createReadNetTool = (
  readTitle: () => string,
): PetrinautAiAutomaticTool => ({
  toolName: readPetrinautNetToolName,
  inputSchema: passthrough,
  outputSchema: passthrough,
  execute: ({ handle }) => ({
    title: readTitle(),
    definition: observeBrowserDefinition(handle).definition,
    extensions: resolvePetrinautHandleCapabilities(handle.capabilities)
      .extensions,
  }),
});

const readDiagnosticsTool: PetrinautAiAutomaticTool = {
  toolName: readPetrinautDiagnosticsToolName,
  inputSchema: passthrough,
  outputSchema: passthrough,
  execute: ({ readDiagnosticsContext }) => readDiagnosticsContext(),
};

/**
 * Lays the net out immediately. The canonical input carries `askUserFirst`,
 * but the Brunch route has no inline confirmation handler, so the result says
 * the layout was applied without asking rather than stalling on a prompt
 * nobody can answer.
 */
const layoutNetTool: PetrinautAiAutomaticTool = {
  toolName: layoutPetrinautNetToolName,
  inputSchema: aiCommandActionInputSchemas.applyAutoLayout,
  outputSchema: passthrough,
  execute: async ({ input, commands, viewport }) => {
    const { askUserFirst } =
      aiCommandActionInputSchemas.applyAutoLayout.parse(input);
    const { commitCount } = await commands.applyAutoLayout();
    const frameStatus = await viewport.frameSceneAfterRender();
    const detail = [
      askUserFirst
        ? "Applied without confirmation: this host has no inline prompt for layout."
        : undefined,
      `Viewport frame: ${frameStatus}.`,
    ]
      .filter((item): item is string => item !== undefined)
      .join(" ");
    return {
      applied: true,
      commitCount,
      title:
        commitCount === 0
          ? "Auto-layout had no effect"
          : `Auto-laid out ${commitCount} node${commitCount === 1 ? "" : "s"}`,
      detail,
    };
  },
};

/**
 * Return a tool whose result waits for the host to settle any document
 * revision the tool produced. Tools that leave the document unchanged return
 * immediately.
 */
const withDocumentRevisionBarrier = (
  tool: PetrinautAiAutomaticTool,
  settleDocumentRevision: (revisionId: DocumentRevisionId) => Promise<void>,
): PetrinautAiAutomaticTool => ({
  ...tool,
  execute: async (params: PetrinautAiAutomaticToolExecuteParams) => {
    const revisionBefore = params.handle.revisionId.get();
    const output: unknown = await tool.execute(params);
    const revisionAfter = params.handle.revisionId.get();
    if (revisionAfter !== revisionBefore)
      await settleDocumentRevision(revisionAfter);
    return output;
  },
});

export interface BrunchPetrinautToolsInput {
  /** The user-visible net title the net read reports. */
  readonly readTitle: () => string;
  /**
   * Present when this conversation may mutate: the binding the batch tool
   * records its attempts against.
   */
  readonly mutation?: {
    readonly binding: BrowserBinding;
    readonly onOperationFailure?: (
      failure: MutatePetrinetOperationFailure,
    ) => void;
    readonly retainAttempt?: (
      attempt: ConstructionMutationAttempt,
      retainOptions?: { verifyEffects?: boolean },
    ) => void;
  };
  /**
   * Durability barrier for tool-applied document changes. Omitted when the
   * document has no host persistence to wait for.
   */
  readonly settleDocumentRevision?: (
    revisionId: DocumentRevisionId,
  ) => Promise<void>;
}

export const createBrunchPetrinautTools = (
  input: BrunchPetrinautToolsInput,
): PetrinautAiAutomaticTool[] => {
  const tools: PetrinautAiAutomaticTool[] = [
    readDocsTool,
    createReadNetTool(input.readTitle),
    readDiagnosticsTool,
    layoutNetTool,
    ...(input.mutation === undefined
      ? []
      : [
          createMutatePetrinetAutomaticTool(input.mutation.binding, {
            onOperationFailure: input.mutation.onOperationFailure,
            retainAttempt: input.mutation.retainAttempt,
          }),
        ]),
  ];
  const settleDocumentRevision = input.settleDocumentRevision;
  return settleDocumentRevision === undefined
    ? tools
    : tools.map((tool) =>
        withDocumentRevisionBarrier(tool, settleDocumentRevision),
      );
};
