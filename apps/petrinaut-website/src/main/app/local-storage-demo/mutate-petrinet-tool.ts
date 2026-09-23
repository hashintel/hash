import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  applyPetrinautConstructionInputSchema,
  applyPetrinautConstructionOutputSchema,
  applyPetrinautConstructionToolName,
  deriveLayoutEffects,
  parseClientToolResultMetadata,
  verifyDeepConstructionRecord,
  type ApplyPetrinautConstructionInput,
  type ApplyPetrinautConstructionOutput,
  type CanonicalMutationRecord,
  type DeepConstructionRecord,
  type MutationEffects,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import {
  executePetrinautAiMutation,
  type PetrinautAiAutomaticTool,
  type PetrinautAiAutomaticToolExecuteParams,
} from "@hashintel/petrinaut/ui";

import {
  deriveCanonicalMutationEvidence,
  observeBrowserDefinition,
  type BrowserDefinitionObservation,
  type BrowserToolBinding,
} from "./mutation-record";

import type { FlueConversationState } from "@flue/sdk";
import type { DocumentRevisionId } from "@hashintel/petrinaut-core";

export { applyPetrinautConstructionOutputSchema };

export interface SettledLedgerRevision {
  readonly revisionId: string;
  readonly sha256: string;
  readonly ordinal: number;
  readonly markdown: string;
}

type ResolvedBasis =
  | {
      readonly kind: "declared";
      readonly revisionId: string;
      readonly sha256: string;
      readonly locators: { readonly start: number; readonly end: number }[];
      readonly rationale: string;
      readonly scope: "operation";
    }
  | { readonly kind: "absent"; readonly reason: string };

type MappedConstructionInput = {
  readonly toolCallId: string;
  readonly modelInput: ApplyPetrinautConstructionInput;
  readonly authority:
    | {
        readonly status: "verified";
        readonly binding: BrowserToolBinding;
        readonly base: BrowserDefinitionObservation;
        readonly ledger: SettledLedgerRevision;
        readonly bases: readonly ResolvedBasis[];
      }
    | {
        readonly status: "refused";
        readonly binding: BrowserToolBinding;
        readonly reason: string;
        readonly base?: BrowserDefinitionObservation;
      };
};

type RetainedDeepConstructionRecord = DeepConstructionRecord & {
  readonly input: ApplyPetrinautConstructionInput;
  readonly output: ApplyPetrinautConstructionOutput;
};

export interface DeepConstructionReplay {
  readonly terminalRecords: ReadonlyMap<string, RetainedDeepConstructionRecord>;
  readonly blockedToolCallIds: ReadonlySet<string>;
}

const hashText = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));

const sameContent = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const sameBinding = (left: BrowserToolBinding, right: BrowserToolBinding) =>
  left.documentId === right.documentId &&
  left.incarnationId === right.incarnationId &&
  left.conversationId === right.conversationId;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const resolveExcerpt = (markdown: string, excerpt: string) => {
  const start = markdown.indexOf(excerpt);
  if (start === -1)
    throw new Error(
      "A Ledger excerpt is missing from the current settled revision.",
    );
  if (markdown.indexOf(excerpt, start + 1) !== -1)
    throw new Error(
      "A Ledger excerpt is ambiguous in the current settled revision.",
    );
  return { start, end: start + excerpt.length };
};

const resolveBases = (
  input: ApplyPetrinautConstructionInput,
  ledger: SettledLedgerRevision,
): ResolvedBasis[] =>
  input.operations.map(({ evidence }) =>
    evidence === undefined
      ? {
          kind: "absent",
          reason: "No exact Ledger excerpt was supplied for this operation.",
        }
      : {
          kind: "declared",
          revisionId: ledger.revisionId,
          sha256: ledger.sha256,
          locators: evidence.excerpts.map((excerpt) =>
            resolveExcerpt(ledger.markdown, excerpt),
          ),
          rationale: evidence.rationale,
          scope: "operation",
        },
  );

const observedEffects = (effects: MutationEffects) => [
  ...effects.created,
  ...effects.updated,
  ...effects.deleted,
  ...effects.derived,
];

const executeCanonicalOperation = (
  operation: ApplyPetrinautConstructionInput["operations"][number],
  params: PetrinautAiAutomaticToolExecuteParams,
): unknown => {
  const getDefinition = () => {
    const definition = params.handle.doc();
    if (!definition)
      throw new Error("The bound browser document is unavailable.");
    return definition;
  };
  if (operation.toolName === "addPlace")
    return executePetrinautAiMutation({
      aiToolCall: { toolName: operation.toolName, input: operation.input },
      getDefinition,
      mutations: params.mutations,
    });
  if (operation.toolName === "addTransition")
    return executePetrinautAiMutation({
      aiToolCall: { toolName: operation.toolName, input: operation.input },
      getDefinition,
      mutations: params.mutations,
    });
  return executePetrinautAiMutation({
    aiToolCall: { toolName: operation.toolName, input: operation.input },
    getDefinition,
    mutations: params.mutations,
  });
};

const operationRequiresDiagnostics = (
  operation: ApplyPetrinautConstructionInput["operations"][number],
) => {
  if (operation.toolName === "addArc") return true;
  if (operation.toolName === "addPlace")
    return (operation.input.visualizerCode?.trim().length ?? 0) > 0;
  return (
    operation.input.lambdaCode.trim().length > 0 ||
    operation.input.transitionKernelCode.trim().length > 0
  );
};

type StepDiagnostics = CanonicalMutationRecord["diagnostics"];

const readStepDiagnostics = async (
  required: boolean,
  read: () => Promise<string>,
): Promise<StepDiagnostics> => {
  if (!required) return { status: "not-required" };
  try {
    const value = await read();
    return value.includes("changed while diagnostics were running")
      ? { status: "pending" }
      : { status: "settled", value };
  } catch (error) {
    return { status: "failed", error: errorMessage(error) };
  }
};

const deepDiagnosticsFrom = (
  diagnostics: readonly StepDiagnostics[],
): ApplyPetrinautConstructionOutput["diagnostics"] => {
  const failed = diagnostics.find(({ status }) => status === "failed");
  if (failed?.status === "failed")
    return {
      disposition: "failed",
      error: failed.error ?? "Diagnostics failed.",
    };
  if (diagnostics.some(({ status }) => status === "pending"))
    return { disposition: "pending" };
  const settled = diagnostics.flatMap((entry) =>
    entry.status === "settled" && entry.value !== undefined
      ? [entry.value]
      : [],
  );
  return settled.length === 0
    ? { disposition: "not-required" }
    : { disposition: "settled", diagnostics: settled };
};

const ledgerIdentity = ({
  revisionId,
  sha256: digest,
  ordinal,
}: SettledLedgerRevision) => ({
  revisionId,
  sha256: digest,
  ordinal,
});

/**
 * Derive reload idempotency only from canonical Flue history. Each admitted
 * deep call must have exactly one matching dispatch result and a sidecar that
 * passes the shared deep verifier against the Ledger settled before the call.
 */
export const deriveDeepConstructionReplay = async (input: {
  readonly snapshot: Pick<FlueConversationState, "messages">;
  readonly binding: BrowserToolBinding;
}): Promise<DeepConstructionReplay> => {
  const calls = new Map<
    string,
    { input: unknown; ledger?: SettledLedgerRevision; conflicting: boolean }
  >();
  let ledger: SettledLedgerRevision | undefined;

  for (const message of input.snapshot.messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool") continue;
      if (
        part.toolName === "mutate_workpiece" &&
        typeof part.input === "object" &&
        part.input !== null &&
        typeof part.output === "object" &&
        part.output !== null &&
        "markdown" in part.input &&
        typeof part.input.markdown === "string" &&
        "revisionId" in part.output &&
        part.output.revisionId === part.toolCallId &&
        "sha256" in part.output &&
        typeof part.output.sha256 === "string" &&
        "ordinal" in part.output &&
        typeof part.output.ordinal === "number"
      ) {
        ledger = {
          revisionId: part.output.revisionId,
          sha256: part.output.sha256,
          ordinal: part.output.ordinal,
          markdown: part.input.markdown,
        };
      }
      if (part.toolName !== applyPetrinautConstructionToolName) continue;
      const prior = calls.get(part.toolCallId);
      if (prior === undefined) {
        calls.set(part.toolCallId, {
          input: structuredClone(part.input),
          ...(ledger === undefined ? {} : { ledger: structuredClone(ledger) }),
          conflicting: false,
        });
      } else if (!sameContent(prior.input, part.input)) {
        calls.set(part.toolCallId, { ...prior, conflicting: true });
      }
    }
  }

  let results: ReturnType<typeof clientToolHistoryFrom>["results"] = [];
  try {
    results = clientToolHistoryFrom(input.snapshot.messages).results;
  } catch {
    // Every admitted call remains blocked when dispatch history is malformed.
  }

  const terminalRecords = new Map<string, RetainedDeepConstructionRecord>();
  const blockedToolCallIds = new Set<string>();
  for (const [toolCallId, call] of calls) {
    const matching = results.filter(
      (result) =>
        result.toolCallId === toolCallId &&
        result.toolName === applyPetrinautConstructionToolName,
    );
    if (call.conflicting || matching.length !== 1) {
      blockedToolCallIds.add(toolCallId);
      continue;
    }
    const result = matching[0];
    const record = parseClientToolResultMetadata(
      result?.metadata,
    )?.deepConstructionRecord;
    if (record === undefined || result === undefined) {
      blockedToolCallIds.add(toolCallId);
      continue;
    }
    try {
      const verified = await verifyDeepConstructionRecord({
        record,
        toolCallId,
        canonicalInput: call.input,
        canonicalOutput: result.output,
        binding: input.binding,
        ledgerRevision: call.ledger,
      });
      terminalRecords.set(toolCallId, {
        ...record,
        input: verified.input,
        output: verified.output,
      });
    } catch {
      blockedToolCallIds.add(toolCallId);
    }
  }
  return { terminalRecords, blockedToolCallIds };
};

export type DeepConstructionReplayReadiness =
  | { readonly status: "pending" }
  | {
      readonly status: "ready";
      readonly replay: DeepConstructionReplay;
    };

export interface ApplyPetrinautConstructionHostOptions {
  readonly handle: PetrinautAiAutomaticToolExecuteParams["handle"];
  readonly binding: BrowserToolBinding;
  readonly initialLedger?: SettledLedgerRevision;
  readonly replayReadiness: DeepConstructionReplayReadiness;
  readonly settleRevision: (input: {
    readonly documentId: string;
    readonly revisionId: DocumentRevisionId;
  }) => Promise<void>;
}

/** Deep browser tool plus the host-only projection and metadata seams it owns. */
export const createApplyPetrinautConstructionHostTool = (
  options: ApplyPetrinautConstructionHostOptions,
) => {
  let currentBinding: BrowserToolBinding | undefined = options.binding;
  let currentLedger: SettledLedgerRevision | undefined = options.initialLedger;
  // UI messages copy tool inputs. Keep authority private and correlate only a
  // host-issued receipt with the exact model input and issued call identity.
  const mappedInputs = new WeakSet<object>();
  const admitted = new Map<
    string,
    { readonly mapped: MappedConstructionInput; readonly token: string }
  >();
  const publishMapped = (mapped: MappedConstructionInput) => {
    const token = crypto.randomUUID();
    mappedInputs.add(mapped);
    admitted.set(mapped.toolCallId, { mapped, token });
    return {
      toolCallId: mapped.toolCallId,
      modelInput: structuredClone(mapped.modelInput),
      authorizationToken: token,
    };
  };
  const terminal = new Map<
    string,
    {
      readonly modelInput: ApplyPetrinautConstructionInput;
      readonly output: ApplyPetrinautConstructionOutput;
    }
  >();
  const blocked = new Set(
    options.replayReadiness.status === "ready"
      ? options.replayReadiness.replay.blockedToolCallIds
      : [],
  );
  const executing = new Map<
    string,
    {
      readonly modelInput: ApplyPetrinautConstructionInput;
      readonly output: Promise<ApplyPetrinautConstructionOutput>;
    }
  >();
  const records = new Map<string, RetainedDeepConstructionRecord>();
  let executionQueue: Promise<void> = Promise.resolve();

  for (const [toolCallId, record] of options.replayReadiness.status === "ready"
    ? options.replayReadiness.replay.terminalRecords
    : []) {
    terminal.set(toolCallId, {
      modelInput: structuredClone(record.input),
      output: structuredClone(record.output),
    });
    records.set(toolCallId, structuredClone(record));
  }

  const mapClientToolInput = ({
    input,
    toolName,
    toolCallId,
  }: {
    readonly input: unknown;
    readonly toolName: string;
    readonly toolCallId: string;
  }) => {
    if (toolName !== applyPetrinautConstructionToolName) return input;
    const modelInput = applyPetrinautConstructionInputSchema.parse(input);
    const previous = admitted.get(toolCallId);
    if (previous !== undefined) {
      if (!sameContent(previous.mapped.modelInput, modelInput))
        throw new Error("Conflicting duplicate deep construction call.");
      return {
        toolCallId,
        modelInput: structuredClone(modelInput),
        authorizationToken: previous.token,
      };
    }
    const binding = structuredClone(currentBinding ?? options.binding);
    if (options.replayReadiness.status === "pending") {
      const mapped: MappedConstructionInput = {
        toolCallId,
        modelInput,
        authority: {
          status: "refused",
          binding,
          reason:
            "Deep construction replay verification is not ready for this conversation.",
        },
      };
      return publishMapped(mapped);
    }
    let base: BrowserDefinitionObservation | undefined;
    try {
      base = observeBrowserDefinition(options.handle);
      const ledgerRevision = currentLedger;
      if (currentBinding === undefined)
        throw new Error("A current browser binding is required.");
      if (ledgerRevision === undefined)
        throw new Error("A current settled Ledger revision is required.");
      if (hashText(ledgerRevision.markdown) !== ledgerRevision.sha256)
        throw new Error(
          "The current Ledger revision hash does not match its content.",
        );
      const mapped: MappedConstructionInput = {
        toolCallId,
        modelInput,
        authority: {
          status: "verified",
          binding,
          base,
          ledger: structuredClone(ledgerRevision),
          bases: resolveBases(modelInput, ledgerRevision),
        },
      };
      return publishMapped(mapped);
    } catch (error) {
      const mapped: MappedConstructionInput = {
        toolCallId,
        modelInput,
        authority: {
          status: "refused",
          binding,
          reason: errorMessage(error),
          ...(base === undefined ? {} : { base }),
        },
      };
      return publishMapped(mapped);
    }
  };

  const parseMappedInput = (input: unknown): MappedConstructionInput => {
    const unauthorized = () =>
      new Error("The deep construction call lacks host authority.");
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw unauthorized();
    // The automatic-tool parser returns the private record to execute; a
    // browser-delivered copy must first prove its private receipt instead.
    if (mappedInputs.has(input)) return input as MappedConstructionInput;
    const keys = Object.keys(input);
    if (
      keys.length !== 3 ||
      !keys.every((key) =>
        ["toolCallId", "modelInput", "authorizationToken"].includes(key),
      ) ||
      !("toolCallId" in input) ||
      typeof input.toolCallId !== "string" ||
      !("authorizationToken" in input) ||
      typeof input.authorizationToken !== "string" ||
      !("modelInput" in input)
    )
      throw unauthorized();
    const prior = admitted.get(input.toolCallId);
    const parsed = applyPetrinautConstructionInputSchema.safeParse(
      input.modelInput,
    );
    if (
      prior === undefined ||
      prior.token !== input.authorizationToken ||
      !parsed.success ||
      !sameContent(parsed.data, prior.mapped.modelInput)
    )
      throw unauthorized();
    return prior.mapped;
  };

  const refusal = (
    mapped: MappedConstructionInput,
    reason: string,
  ): ApplyPetrinautConstructionOutput =>
    applyPetrinautConstructionOutputSchema.parse({
      execution: "ordered-stop",
      disposition: "refused",
      reason,
      outcomes: mapped.modelInput.operations.map((operation, index) => ({
        index,
        operationId: operation.operationId,
        toolName: operation.toolName,
        status: "unattempted",
      })),
      finalObservation: (() => {
        try {
          const observed = observeBrowserDefinition(options.handle);
          return {
            disposition: "observed" as const,
            documentRevision: observed.revisionId,
            definitionHash: observed.sha256,
          };
        } catch {
          return { disposition: "unavailable" as const, reason };
        }
      })(),
      diagnostics: { disposition: "not-required" },
      layout:
        mapped.modelInput.layout?.requested === true
          ? { requested: true, disposition: "not-relevant" }
          : { requested: false, disposition: "not-requested" },
    });

  const retainRefusal = (
    mapped: MappedConstructionInput,
    reason: string,
    output: ApplyPetrinautConstructionOutput,
  ) => {
    records.set(mapped.toolCallId, {
      toolCallId: mapped.toolCallId,
      binding: structuredClone(mapped.authority.binding),
      input: structuredClone(mapped.modelInput),
      authority: { status: "refused", reason },
      attempts: [],
      output: structuredClone(output),
    });
  };

  const run = async (
    mapped: MappedConstructionInput,
    params: PetrinautAiAutomaticToolExecuteParams,
  ): Promise<ApplyPetrinautConstructionOutput> => {
    if (mapped.authority.status === "refused") {
      const output = refusal(mapped, mapped.authority.reason);
      retainRefusal(mapped, mapped.authority.reason, output);
      return output;
    }
    let liveBase: BrowserDefinitionObservation;
    try {
      liveBase = observeBrowserDefinition(options.handle);
    } catch (error) {
      const reason = errorMessage(error);
      const output = refusal(mapped, reason);
      retainRefusal(mapped, reason, output);
      return output;
    }
    const authorityChanged =
      params.handle !== options.handle ||
      currentBinding === undefined ||
      !sameBinding(currentBinding, mapped.authority.binding) ||
      liveBase.sha256 !== mapped.authority.base.sha256 ||
      liveBase.revisionId !== mapped.authority.base.revisionId ||
      currentLedger === undefined ||
      currentLedger.revisionId !== mapped.authority.ledger.revisionId ||
      currentLedger.sha256 !== mapped.authority.ledger.sha256;
    if (authorityChanged) {
      const reason =
        "The bound document, settled Ledger, or projected live base changed before execution.";
      const output = refusal(mapped, reason);
      retainRefusal(mapped, reason, output);
      return output;
    }

    const outcomes: ApplyPetrinautConstructionOutput["outcomes"] = [];
    let attempts: CanonicalMutationRecord[] = [];
    const diagnosticsStepIndexes: number[] = [];
    let stopped = false;
    for (const [index, operation] of mapped.modelInput.operations.entries()) {
      if (stopped) {
        outcomes.push({
          index,
          operationId: operation.operationId,
          toolName: operation.toolName,
          status: "unattempted",
        });
        continue;
      }
      const pre = observeBrowserDefinition(options.handle);
      let canonicalOutput: unknown;
      let callbackError: unknown;
      try {
        canonicalOutput = executeCanonicalOperation(operation, params);
      } catch (error) {
        callbackError = error;
      }
      const post = observeBrowserDefinition(options.handle);
      const evidence = deriveCanonicalMutationEvidence({
        toolName: operation.toolName,
        input: operation.input,
        pre,
        post,
      });
      let settlement: CanonicalMutationRecord["settlement"] = {
        status: "not-required",
      };
      let settlementError: unknown;
      if (pre.sha256 !== post.sha256) {
        try {
          await options.settleRevision({
            documentId: mapped.authority.binding.documentId,
            revisionId: post.revisionId,
          });
          settlement = { status: "settled", revisionId: post.revisionId };
        } catch (error) {
          settlementError = error;
          settlement = {
            status: "failed",
            revisionId: post.revisionId,
            error: errorMessage(error),
          };
        }
      }
      const stepDiagnostics: StepDiagnostics = { status: "not-required" };
      if (
        pre.sha256 !== post.sha256 &&
        operationRequiresDiagnostics(operation)
      ) {
        diagnosticsStepIndexes.push(attempts.length);
      }
      const hostError =
        callbackError === undefined
          ? settlementError === undefined
            ? undefined
            : `The document revision was not settled: ${errorMessage(settlementError)}`
          : settlementError === undefined
            ? errorMessage(callbackError)
            : `${errorMessage(callbackError)}; the changed revision was not settled: ${errorMessage(settlementError)}`;
      const outcome =
        hostError === undefined
          ? evidence.outcome
          : pre.sha256 === post.sha256
            ? ("failed" as const)
            : ("unknown" as const);
      const output =
        hostError === undefined
          ? canonicalOutput
          : { applied: false, reason: hostError };
      attempts.push({
        toolCallId: mapped.toolCallId,
        toolName: operation.toolName,
        binding: structuredClone(mapped.authority.binding),
        input: structuredClone(operation.input),
        pre,
        post,
        outcome,
        effects: evidence.effects,
        settlement,
        diagnostics: stepDiagnostics,
        output,
        ...(hostError === undefined ? {} : { error: hostError }),
      });
      if (outcome === "applied" || outcome === "no-op") {
        outcomes.push({
          index,
          operationId: operation.operationId,
          toolName: operation.toolName,
          status: outcome,
          effects: observedEffects(evidence.effects),
        });
      } else {
        outcomes.push({
          index,
          operationId: operation.operationId,
          toolName: operation.toolName,
          status: outcome,
          error: hostError ?? "The canonical mutation failed.",
        });
      }
      if (outcome === "failed" || outcome === "unknown") stopped = true;
    }

    const batchDiagnostics = await readStepDiagnostics(
      diagnosticsStepIndexes.length > 0,
      params.readDiagnosticsContext,
    );
    if (diagnosticsStepIndexes.length > 0) {
      const relevantIndexes = new Set(diagnosticsStepIndexes);
      attempts = attempts.map((attempt, index) =>
        relevantIndexes.has(index)
          ? { ...attempt, diagnostics: structuredClone(batchDiagnostics) }
          : attempt,
      );
    }
    const deepDiagnostics = deepDiagnosticsFrom([batchDiagnostics]);
    const diagnosticsPermitLayout =
      batchDiagnostics.status === "not-required" ||
      batchDiagnostics.status === "settled";
    const layoutRequested = mapped.modelInput.layout?.requested === true;
    const structurallyApplied = outcomes.some(
      ({ status }) => status === "applied",
    );
    let layout: ApplyPetrinautConstructionOutput["layout"] = layoutRequested
      ? { requested: true, disposition: "not-relevant" }
      : { requested: false, disposition: "not-requested" };
    let layoutRecord: DeepConstructionRecord["layout"];
    const baseHasStructure =
      mapped.authority.base.definition.places.length > 0 ||
      mapped.authority.base.definition.transitions.length > 0 ||
      (mapped.authority.base.definition.componentInstances?.length ?? 0) > 0;
    if (layoutRequested && !diagnosticsPermitLayout) {
      layout = {
        requested: true,
        disposition: "failed",
        error:
          batchDiagnostics.status === "pending"
            ? "Layout was not applied because diagnostics are still pending."
            : `Layout was not applied because diagnostics failed${batchDiagnostics.error === undefined ? "." : `: ${batchDiagnostics.error}`}`,
      };
    } else if (
      layoutRequested &&
      structurallyApplied &&
      !stopped &&
      baseHasStructure
    ) {
      layout = { requested: true, disposition: "confirmation-required" };
    } else if (layoutRequested && structurallyApplied && !stopped) {
      const preLayout = observeBrowserDefinition(options.handle);
      let commitCount: number | undefined;
      let layoutError: unknown;
      try {
        ({ commitCount } = await params.commands.applyAutoLayout({
          targetSubnetId: null,
        }));
      } catch (error) {
        layoutError = error;
      }
      const postLayout = observeBrowserDefinition(options.handle);
      const layoutChanged = preLayout.sha256 !== postLayout.sha256;
      if (layoutError === undefined || layoutChanged) {
        try {
          const effects = deriveLayoutEffects(
            preLayout.definition,
            postLayout.definition,
          );
          try {
            await options.settleRevision({
              documentId: mapped.authority.binding.documentId,
              revisionId: postLayout.revisionId,
            });
            layoutRecord = {
              pre: preLayout,
              post: postLayout,
              effects,
              settlement: {
                status: "settled",
                revisionId: postLayout.revisionId,
              },
            };
          } catch (error) {
            const settlementError = `The layout revision was not settled: ${errorMessage(error)}`;
            const terminalError =
              layoutError === undefined
                ? settlementError
                : `${errorMessage(layoutError)}; ${settlementError}`;
            layoutError = terminalError;
            if (layoutChanged)
              layoutRecord = {
                pre: preLayout,
                post: postLayout,
                effects,
                settlement: {
                  status: "failed",
                  revisionId: postLayout.revisionId,
                  error: terminalError,
                },
              };
          }
        } catch (error) {
          layoutError =
            layoutError === undefined
              ? error
              : `${errorMessage(layoutError)}; ${errorMessage(error)}`;
        }
      }
      if (
        layoutError === undefined &&
        commitCount !== undefined &&
        commitCount > 0
      ) {
        try {
          await params.viewport.frameSceneAfterRender();
        } catch (error) {
          layoutError = error;
        }
      }
      if (layoutError === undefined) {
        layout = {
          requested: true,
          disposition: "applied",
          preHash: preLayout.sha256,
          postHash: postLayout.sha256,
        };
      } else {
        if (!layoutChanged) layoutRecord = undefined;
        layout = {
          requested: true,
          disposition: "failed",
          error: errorMessage(layoutError),
          ...(layoutRecord === undefined
            ? {}
            : {
                preHash: preLayout.sha256,
                postHash: postLayout.sha256,
              }),
        };
      }
    }

    const final = observeBrowserDefinition(options.handle);
    const output = applyPetrinautConstructionOutputSchema.parse({
      execution: "ordered-stop",
      disposition: stopped ? "partial" : "complete",
      outcomes,
      finalObservation: {
        disposition: "observed",
        documentRevision: final.revisionId,
        definitionHash: final.sha256,
      },
      diagnostics: deepDiagnostics,
      layout,
    });
    records.set(mapped.toolCallId, {
      toolCallId: mapped.toolCallId,
      binding: structuredClone(mapped.authority.binding),
      input: structuredClone(mapped.modelInput),
      authority: {
        status: "verified",
        base: structuredClone(mapped.authority.base),
        ledger: ledgerIdentity(mapped.authority.ledger),
        bases: [...structuredClone(mapped.authority.bases)],
      },
      attempts: structuredClone(attempts),
      ...(layoutRecord === undefined
        ? {}
        : { layout: structuredClone(layoutRecord) }),
      output: structuredClone(output),
    });
    return output;
  };

  const tool: PetrinautAiAutomaticTool = {
    toolName: applyPetrinautConstructionToolName,
    inputSchema: { parse: parseMappedInput },
    outputSchema: applyPetrinautConstructionOutputSchema,
    execute: async (params) => {
      const mapped = parseMappedInput(params.input);
      if (mapped.toolCallId !== params.toolCallId)
        throw new Error(
          "The deep construction dispatch identity changed after admission.",
        );
      const prior = terminal.get(params.toolCallId);
      if (prior !== undefined) {
        if (!sameContent(prior.modelInput, mapped.modelInput))
          throw new Error("Conflicting duplicate deep construction call.");
        return structuredClone(prior.output);
      }
      if (blocked.has(params.toolCallId)) {
        const reason =
          "This deep construction call was previously admitted without one verifiable terminal record.";
        const output = refusal(mapped, reason);
        retainRefusal(mapped, reason, output);
        return output;
      }
      const active = executing.get(params.toolCallId);
      if (active !== undefined) {
        if (!sameContent(active.modelInput, mapped.modelInput))
          throw new Error("Conflicting duplicate deep construction call.");
        return active.output.then((output) => structuredClone(output));
      }
      const execution = executionQueue.then(() => run(mapped, params));
      executionQueue = execution.then(
        () => undefined,
        () => undefined,
      );
      executing.set(params.toolCallId, {
        modelInput: structuredClone(mapped.modelInput),
        output: execution,
      });
      const output = await execution.finally(() =>
        executing.delete(params.toolCallId),
      );
      terminal.set(params.toolCallId, {
        modelInput: structuredClone(mapped.modelInput),
        output: structuredClone(output),
      });
      return output;
    },
  };

  return {
    tool,
    mapClientToolInput,
    updateAuthority: (authority: {
      readonly binding: BrowserToolBinding | undefined;
      readonly ledger: SettledLedgerRevision | undefined;
    }) => {
      currentBinding =
        authority.binding === undefined
          ? undefined
          : structuredClone(authority.binding);
      currentLedger =
        authority.ledger === undefined
          ? undefined
          : structuredClone(authority.ledger);
    },
    recordFor: (toolCallId: string) => {
      const record = records.get(toolCallId);
      return record === undefined ? undefined : structuredClone(record);
    },
    clientToolResultMetadataFor: (toolCallId: string) => {
      const record = records.get(toolCallId);
      if (record === undefined) return undefined;
      return parseClientToolResultMetadata({
        deepConstructionRecord: structuredClone(record),
      });
    },
  };
};
