/**
 * The net ledger: one deterministic fold over canonical Flue history that
 * yields, in history order, every browser tool call that observed or changed
 * the net, with its record verified.
 *
 * It is a projection, not a store. It persists nothing, invents no
 * identities (each event is the assistant's own tool call at its own place in
 * history), keeps a missing or ambiguous record as an `unrecorded` event with
 * its reason rather than repairing or dropping it, takes no live Petrinaut
 * observation as input, and leaves Flue history the only authority.
 *
 * Freshness folds over these events. Whether why moves onto them too is
 * decided by a parity test against its own attribution walk, not assumed
 * here; projections must remain recomputable from canonical history.
 */
import {
  applyPetrinautConstructionToolName,
  canonicalContent,
  declarePetrinautProjectionToolName,
  draftPetrinautExperimentToolName,
  isConstructionMutationName,
  isLayoutPetrinautNetToolName,
  isMutatePetrinautNetToolName,
  isReadPetrinautDocsToolName,
  isReadPetrinautDiagnosticsToolName,
  isReadPetrinautNetToolName,
  mutatePetrinetInputSchema,
  parseClientToolResultMetadata,
  verifyCanonicalMutationRecord,
  verifyDeepConstructionRecord,
  verifyDeclaredProjectionOutput,
  verifyExperimentRecord,
  verifyDefinitionObservation,
  type DeclaredBasis,
  type ConstructionMutationAttempt,
  type DeclaredProjectionOutput,
  type DefinitionObservation,
  type MutationEffects,
  type VerifiedExperimentRecord,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { CANONICAL_PETRINAUT_TOOL_NAMES } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import { MUTATE_WORKPIECE_TOOL_NAME } from "@hashintel/brunch-agent/flue";
import {
  createExperimentToolName,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core";

import { BROWSER_CALL_UNSTARTED_ERROR } from "./browser-call-rendezvous.ts";
import { isAwaitingClient } from "./client-tools.ts";
import { verifyMutatePetrinetAttempts } from "./mutation-delivery.ts";
import { retainedSettledRevision } from "./workpiece.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

/** The fold reads the conversation's binding and nothing else of the context. */
export type NetLedgerBrowser = BrowserContext | Pick<BrowserContext, "binding">;

/** Where in history the assistant made the call: message, then part. */
export interface NetLedgerPosition {
  readonly messageIndex: number;
  readonly partIndex: number;
}

export type NetLedgerEvent =
  | {
      readonly kind: "read";
      readonly toolCallId: string;
      readonly position: NetLedgerPosition;
      /** Verified: re-parsed and re-hashed from the recorded sidecar. */
      readonly observation: DefinitionObservation;
    }
  | {
      readonly kind: "mutation";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly position: NetLedgerPosition;
      readonly outcome: string;
      /** Verified post hash of the last applied attempt in the record. */
      readonly postHash: string;
      /** Absent only for retained pre-revision records. */
      readonly postRevisionId?: string;
      /** Verified observations/effects are retained so why can locate the affected target. */
      readonly pre?: DefinitionObservation;
      readonly post?: DefinitionObservation;
      readonly effects?: MutationEffects;
      /** Present for verified direct canonical calls; legacy batches retain their own attempts. */
      readonly attempt?: ConstructionMutationAttempt;
      readonly provenance:
        | {
            readonly standing: "declared-projection";
            readonly operationId: string;
            readonly intendedEffect: string;
            readonly intendedTarget: string;
            readonly expectedImpact: readonly string[];
            readonly basis: DeclaredBasis;
            readonly impactAssessment: "owner-adjudication-required";
          }
        | {
            readonly standing: "temporal/basis-absent";
            readonly basis: Extract<DeclaredBasis, { kind: "absent" }>;
          };
    }
  | {
      /** One verified Interface B outer call; step identities are ordered positions, never invented calls. */
      readonly kind: "construction";
      readonly toolCallId: string;
      readonly position: NetLedgerPosition;
      readonly disposition: "complete" | "partial" | "refused";
      readonly authority:
        | { readonly status: "verified"; readonly base: DefinitionObservation }
        | { readonly status: "refused"; readonly reason: string };
      readonly steps: readonly {
        readonly operationId: string;
        readonly toolName: string;
        readonly intendedEffect: string;
        readonly intendedTarget: string;
        readonly expectedImpact: readonly string[];
        readonly impactAssessment: "owner-adjudication-required";
        readonly basis: DeclaredBasis;
        readonly attempt: ConstructionMutationAttempt;
      }[];
    }
  | {
      /** A terminal experiment over a verified immutable source revision; never a document change. */
      readonly kind: "experiment";
      readonly toolCallId: string;
      readonly position: NetLedgerPosition;
      readonly input: VerifiedExperimentRecord["input"];
      readonly source: VerifiedExperimentRecord["source"];
      readonly output: VerifiedExperimentRecord["output"];
    }
  | {
      readonly kind: "layout";
      readonly toolCallId: string;
      readonly position: NetLedgerPosition;
      readonly pre: DefinitionObservation;
      readonly post: DefinitionObservation;
    }
  | {
      /** The call exists in history but its record cannot vouch for what it did. */
      readonly kind: "unrecorded";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly position: NetLedgerPosition;
      readonly reason: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Browser-executed tools that observe the net without changing it. */
const isNetDefinitionReadTool = (name: string): boolean =>
  isReadPetrinautNetToolName(name) || name === getLatestNetDefinitionToolName;

const canonicalBrowserToolNames: ReadonlySet<string> = new Set(
  CANONICAL_PETRINAUT_TOOL_NAMES,
);

const isNonMutatingBrowserTool = (name: string): boolean =>
  isNetDefinitionReadTool(name) ||
  name === draftPetrinautExperimentToolName ||
  name === createExperimentToolName ||
  name === getNetCompilationErrorsToolName ||
  name === readPetrinautDocToolName ||
  isReadPetrinautDiagnosticsToolName(name) ||
  isReadPetrinautDocsToolName(name);

/** A model-selected ID selects a recorded browser observation, never a model-supplied hash. */
export const recordedBrowserObservation = async (
  snapshot: FlueConversationSnapshot,
  browser: NetLedgerBrowser,
  toolCallId: string,
): Promise<DefinitionObservation> => {
  const calls = snapshot.messages
    .flatMap((message) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts
        : [],
    )
    .filter(
      (part) => part.type === "dynamic-tool" && part.toolCallId === toolCallId,
    );
  const call = calls[0];
  if (
    calls.length !== 1 ||
    call?.type !== "dynamic-tool" ||
    !isNetDefinitionReadTool(call.toolName) ||
    call.state !== "output-available" ||
    (!isAwaitingClient(call.output) &&
      !(isRecord(call.output) && call.output.brunchBrowserResult === true))
  )
    throw new Error("Unknown admitted browser observation call.");
  const results = clientToolHistoryFrom(snapshot.messages).results.filter(
    (result) => result.toolCallId === toolCallId,
  );
  const first = results[0];
  const recorded = parseClientToolResultMetadata(first?.metadata)?.observation;
  if (
    !first ||
    results.length !== 1 ||
    results.some(
      (result) => canonicalContent(result) !== canonicalContent(first),
    ) ||
    first.toolName !== call.toolName ||
    recorded === undefined ||
    !isRecord(first.output)
  )
    throw new Error("Missing or conflicting correlated browser observation.");
  if (
    recorded.toolCallId !== toolCallId ||
    canonicalContent(recorded.binding) !== canonicalContent(browser.binding)
  )
    throw new Error(
      "Browser observation belongs to another conversation or document incarnation.",
    );
  const observation = await verifyDefinitionObservation(recorded.observed);
  if (
    canonicalContent(first.output.definition) !==
    canonicalContent(observation.definition)
  )
    throw new Error(
      "Browser read output differs from its independent observation.",
    );
  return observation;
};

/** The verified post observation of the last applied attempt, or undefined when the record cannot vouch for one. */
const appliedPostObservation = async (
  attempts: readonly unknown[],
): Promise<DefinitionObservation | undefined> => {
  let post: DefinitionObservation | undefined;
  for (const attempt of attempts) {
    if (!isRecord(attempt) || attempt.outcome !== "applied") continue;
    if (!isRecord(attempt.post)) return undefined;
    try {
      // eslint-disable-next-line no-await-in-loop -- Attempts commit in order; the last applied post wins.
      post = await verifyDefinitionObservation({
        definition: attempt.post.definition,
        sha256: String(attempt.post.sha256),
        revisionId: attempt.post.revisionId,
      });
    } catch {
      return undefined;
    }
  }
  return post;
};

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Fold canonical history into ledger events. Only the snapshot and the
 * conversation's binding are inputs; the construction flag and any live
 * document state are not.
 */
export const deriveNetLedger = async (
  snapshot: FlueConversationSnapshot,
  browser: NetLedgerBrowser,
): Promise<readonly NetLedgerEvent[]> => {
  const results = clientToolHistoryFrom(snapshot.messages).results;
  const deliveriesFor = (toolCallId: string) =>
    results.filter((result) => result.toolCallId === toolCallId);
  const events: NetLedgerEvent[] = [];
  let pendingDeclaration:
    | { output: DeclaredProjectionOutput; nextOperation: number }
    | undefined;

  for (const [messageIndex, message] of snapshot.messages.entries()) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const [partIndex, call] of message.parts.entries()) {
      if (call.type !== "dynamic-tool") continue;
      if (call.toolName === MUTATE_WORKPIECE_TOOL_NAME) {
        pendingDeclaration = undefined;
        continue;
      }
      // A proposal has no document effect and must not consume a pending declaration.
      if (call.toolName === draftPetrinautExperimentToolName) continue;
      if (call.toolName === declarePetrinautProjectionToolName) {
        pendingDeclaration = undefined;
        if (call.state !== "output-available") continue;
        const revisionId = isRecord(call.output)
          ? isRecord(call.output.revision) &&
            typeof call.output.revision.revisionId === "string"
            ? call.output.revision.revisionId
            : undefined
          : undefined;
        if (revisionId === undefined) continue;
        const beforeDeclaration: FlueConversationSnapshot = {
          ...snapshot,
          messages: [
            ...snapshot.messages.slice(0, messageIndex),
            { ...message, parts: message.parts.slice(0, partIndex) },
          ],
        };
        const latestSettlementCall = beforeDeclaration.messages
          .flatMap((entry) =>
            entry.role === "assistant" && entry.purpose === "assistant"
              ? entry.parts
              : [],
          )
          .findLast(
            (part) =>
              part.type === "dynamic-tool" &&
              part.toolName === MUTATE_WORKPIECE_TOOL_NAME &&
              part.state === "output-available",
          );
        if (
          latestSettlementCall?.type !== "dynamic-tool" ||
          latestSettlementCall.toolCallId !== revisionId
        )
          continue;
        const currentRevision = retainedSettledRevision(
          beforeDeclaration,
          revisionId,
        );
        if (currentRevision === undefined) continue;
        try {
          pendingDeclaration = {
            // eslint-disable-next-line no-await-in-loop -- Declaration authority is folded in canonical history order.
            output: await verifyDeclaredProjectionOutput({
              issuedInput: call.input,
              recordedOutput: call.output,
              currentRevision,
            }),
            nextOperation: 0,
          };
        } catch {
          // An invalid declaration cannot lend provenance to a later call.
        }
        continue;
      }
      const position: NetLedgerPosition = { messageIndex, partIndex };
      if (call.state === "output-error") {
        const potentiallyMutatingBrowserCall =
          (canonicalBrowserToolNames.has(call.toolName) &&
            !isNonMutatingBrowserTool(call.toolName)) ||
          isLayoutPetrinautNetToolName(call.toolName) ||
          isMutatePetrinautNetToolName(call.toolName) ||
          call.toolName === applyPetrinautConstructionToolName;
        if (potentiallyMutatingBrowserCall) {
          pendingDeclaration = undefined;
          if (!call.errorText.includes(BROWSER_CALL_UNSTARTED_ERROR))
            events.push({
              kind: "unrecorded",
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              position,
              reason:
                "A browser mutation failed without a verified terminal document observation; the effect may be unknown.",
            });
        }
        continue;
      }
      if (
        call.state !== "output-available" ||
        !(
          isAwaitingClient(call.output) ||
          (isRecord(call.output) && call.output.brunchBrowserResult === true)
        )
      )
        continue;
      const { toolCallId, toolName } = call;
      const expectedDeclaration =
        pendingDeclaration?.output.operations[pendingDeclaration.nextOperation];
      const declarationForCall =
        isConstructionMutationName(toolName) &&
        expectedDeclaration?.toolName === toolName &&
        pendingDeclaration
          ? { pending: pendingDeclaration, operation: expectedDeclaration }
          : undefined;
      if (
        isConstructionMutationName(toolName) ||
        !isNonMutatingBrowserTool(toolName)
      )
        pendingDeclaration = undefined;
      const unrecorded = (reason: string): NetLedgerEvent => ({
        kind: "unrecorded",
        toolCallId,
        toolName,
        position,
        reason,
      });

      if (isNetDefinitionReadTool(toolName)) {
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const observation = await recordedBrowserObservation(
            snapshot,
            browser,
            toolCallId,
          );
          events.push({ kind: "read", toolCallId, position, observation });
        } catch (error) {
          events.push(unrecorded(reasonOf(error)));
        }
        continue;
      }
      if (
        isNonMutatingBrowserTool(toolName) &&
        toolName !== createExperimentToolName
      )
        continue;

      const deliveries = deliveriesFor(toolCallId);
      const first = deliveries[0];
      if (first === undefined) {
        events.push(
          unrecorded("No browser result was delivered for this call."),
        );
        continue;
      }
      if (deliveries.length !== 1) {
        const conflicting = deliveries.some(
          (delivery) => canonicalContent(delivery) !== canonicalContent(first),
        );
        events.push(
          unrecorded(
            conflicting
              ? "Conflicting browser results were delivered for this call."
              : "Duplicate browser results were delivered for this call.",
          ),
        );
        continue;
      }
      if (first.toolName !== toolName) {
        events.push(
          unrecorded("The browser result names a different canonical call."),
        );
        continue;
      }
      const metadata = parseClientToolResultMetadata(first.metadata);

      if (toolName === createExperimentToolName) {
        const record = metadata?.experimentRecord;
        if (record === undefined) {
          events.push(
            unrecorded("The experiment result carries no experiment record."),
          );
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const verified = await verifyExperimentRecord({
            record,
            toolCallId,
            canonicalInput: call.input,
            canonicalOutput: first.output,
            binding: browser.binding,
          });
          events.push({
            kind: "experiment",
            toolCallId,
            position,
            input: verified.input,
            source: verified.source,
            output: verified.output,
          });
        } catch (error) {
          events.push(unrecorded(reasonOf(error)));
        }
        continue;
      }

      if (isLayoutPetrinautNetToolName(toolName)) {
        const layout = metadata?.layoutRecord;
        if (layout === undefined) {
          events.push(
            unrecorded("The layout result carries no layout record."),
          );
          continue;
        }
        if (
          layout.toolCallId !== toolCallId ||
          canonicalContent(layout.binding) !== canonicalContent(browser.binding)
        ) {
          events.push(
            unrecorded(
              "The layout record belongs to another call, conversation or document incarnation.",
            ),
          );
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const [pre, post] = await Promise.all([
            verifyDefinitionObservation(layout.pre),
            verifyDefinitionObservation(layout.post),
          ]);
          events.push({ kind: "layout", toolCallId, position, pre, post });
        } catch (error) {
          events.push(unrecorded(reasonOf(error)));
        }
        continue;
      }

      if (toolName === applyPetrinautConstructionToolName) {
        const beforeCall: FlueConversationSnapshot = {
          ...snapshot,
          messages: [
            ...snapshot.messages.slice(0, messageIndex),
            { ...message, parts: message.parts.slice(0, partIndex) },
          ],
        };
        const latestSettlement = beforeCall.messages
          .flatMap((entry) =>
            entry.role === "assistant" && entry.purpose === "assistant"
              ? entry.parts
              : [],
          )
          .findLast(
            (part) =>
              part.type === "dynamic-tool" &&
              part.toolName === MUTATE_WORKPIECE_TOOL_NAME &&
              part.state === "output-available" &&
              retainedSettledRevision(beforeCall, part.toolCallId) !==
                undefined,
          );
        const ledgerRevision =
          latestSettlement?.type === "dynamic-tool"
            ? retainedSettledRevision(beforeCall, latestSettlement.toolCallId)
            : undefined;
        const deepRecord = metadata?.deepConstructionRecord;
        if (deepRecord === undefined) {
          events.push(
            unrecorded(
              "The deep construction result carries no deep construction record.",
            ),
          );
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const verified = await verifyDeepConstructionRecord({
            record: deepRecord,
            toolCallId,
            canonicalInput: call.input,
            canonicalOutput: first.output,
            binding: browser.binding,
            ledgerRevision,
          });
          events.push({
            kind: "construction",
            toolCallId,
            position,
            disposition: verified.output.disposition,
            authority:
              verified.authority.status === "verified"
                ? {
                    status: "verified",
                    base: verified.authority.base,
                  }
                : {
                    status: "refused",
                    reason: verified.authority.reason,
                  },
            steps: verified.attempts.map(({ operation, basis, record }) => ({
              operationId: operation.operationId,
              toolName: operation.toolName,
              intendedEffect: operation.intendedEffect,
              intendedTarget: operation.intendedTarget,
              expectedImpact: operation.expectedImpact,
              impactAssessment: "owner-adjudication-required",
              basis,
              attempt: {
                request: {
                  toolCallId,
                  toolName: record.toolName,
                  input: record.input,
                  binding: browser.binding,
                  requestedBaseHash: record.pre.sha256,
                },
                binding: browser.binding,
                pre: record.pre,
                ...(record.post === undefined ? {} : { post: record.post }),
                outcome: record.outcome,
                effects: record.effects,
                ...(record.error === undefined ? {} : { error: record.error }),
              },
            })),
          });
        } catch (error) {
          events.push(unrecorded(reasonOf(error)));
        }
        continue;
      }

      const canonicalRecord = metadata?.canonicalMutationRecord;
      if (isConstructionMutationName(toolName)) {
        if (canonicalRecord === undefined) {
          // `unrecorded` denies a verified call-to-settled-change claim, not
          // Petrinaut's document change. Scenario/metric calls execute without
          // Brunch sidecars even when their revisions are persisted.
          events.push(
            unrecorded(
              "The canonical mutation result carries no canonical mutation record.",
            ),
          );
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const verified = await verifyCanonicalMutationRecord({
            record: canonicalRecord,
            toolCallId,
            toolName,
            canonicalInput: call.input,
            canonicalOutput: first.output,
            binding: browser.binding,
          });
          if (
            (verified.outcome !== "applied" && verified.outcome !== "no-op") ||
            verified.post === undefined
          )
            throw new Error(
              "The canonical mutation record cannot vouch for a durable post observation.",
            );
          const matchedDeclaration = declarationForCall?.operation;
          const provenance: Extract<
            NetLedgerEvent,
            { kind: "mutation" }
          >["provenance"] = matchedDeclaration
            ? {
                standing: "declared-projection",
                operationId: matchedDeclaration.operationId,
                intendedEffect: matchedDeclaration.intendedEffect,
                intendedTarget: matchedDeclaration.intendedTarget,
                expectedImpact: matchedDeclaration.expectedImpact,
                basis: matchedDeclaration.basis,
                impactAssessment: "owner-adjudication-required",
              }
            : {
                standing: "temporal/basis-absent",
                basis: {
                  kind: "absent",
                  reason:
                    "No verified declaration was correlated with this direct canonical call.",
                },
              };
          events.push({
            kind: "mutation",
            toolCallId,
            toolName,
            position,
            outcome: verified.outcome,
            postHash: verified.post.sha256,
            ...(verified.post.revisionId === undefined
              ? {}
              : { postRevisionId: verified.post.revisionId }),
            pre: verified.pre,
            post: verified.post,
            effects: verified.effects,
            attempt: {
              request: {
                toolCallId,
                toolName: verified.toolName,
                input: verified.input,
                binding: browser.binding,
                requestedBaseHash: verified.pre.sha256,
              },
              binding: browser.binding,
              pre: verified.pre,
              post: verified.post,
              outcome: verified.outcome,
              effects: verified.effects,
              ...(verified.error === undefined
                ? {}
                : { error: verified.error }),
            },
            provenance,
          });
          if (declarationForCall) {
            declarationForCall.pending.nextOperation += 1;
            if (
              declarationForCall.pending.nextOperation <
              declarationForCall.pending.output.operations.length
            )
              pendingDeclaration = declarationForCall.pending;
          }
        } catch (error) {
          pendingDeclaration = undefined;
          events.push(unrecorded(reasonOf(error)));
        }
        continue;
      }

      if (!isNonMutatingBrowserTool(toolName)) pendingDeclaration = undefined;
      const record = metadata?.mutationRecord;
      if (record === undefined) {
        events.push(
          unrecorded("The mutation result carries no mutation record."),
        );
        continue;
      }
      if (record.outcome === "unknown") {
        events.push(
          unrecorded(
            "The unknown aggregate mutation outcome cannot vouch for a post observation.",
          ),
        );
        continue;
      }
      if (isMutatePetrinautNetToolName(toolName)) {
        try {
          const batch = mutatePetrinetInputSchema.parse(call.input);
          // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
          const attempts = await verifyMutatePetrinetAttempts({
            toolCallId,
            batch,
            binding: browser.binding,
            output: first.output,
            mutationRecord: record,
          });
          const post = attempts.at(-1)?.post;
          if (post === undefined)
            throw new Error(
              "The mutation record cannot vouch for a verified post observation.",
            );
          events.push({
            kind: "mutation",
            toolCallId,
            toolName,
            position,
            outcome: record.outcome,
            postHash: post.sha256,
            ...(post.revisionId === undefined
              ? {}
              : { postRevisionId: post.revisionId }),
            provenance: {
              standing: "temporal/basis-absent",
              basis: {
                kind: "absent",
                reason:
                  "Legacy batch provenance is carried by its operation records.",
              },
            },
          });
        } catch (error) {
          events.push(
            unrecorded(
              `The mutation record cannot vouch for a verified post observation: ${reasonOf(error)}`,
            ),
          );
        }
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- History order is the fold order.
      const post = await appliedPostObservation(record.attempts);
      if (post === undefined) {
        events.push(
          unrecorded(
            "The mutation record cannot vouch for a verified post observation.",
          ),
        );
        continue;
      }
      events.push({
        kind: "mutation",
        toolCallId,
        toolName,
        position,
        outcome: record.outcome,
        postHash: post.sha256,
        ...(post.revisionId === undefined
          ? {}
          : { postRevisionId: post.revisionId }),
        provenance: {
          standing: "temporal/basis-absent",
          basis: {
            kind: "absent",
            reason:
              "Legacy mutation provenance remains in its retained record.",
          },
        },
      });
    }
  }
  return events;
};

/** Authority belongs to the immutable history prefix before this exact issued draft. */
export const verifiedDraftReadBefore = async (
  snapshot: FlueConversationSnapshot,
  browser: NetLedgerBrowser,
  draftCallId: string,
): Promise<DefinitionObservation> => {
  const positions = snapshot.messages.flatMap((message, messageIndex) =>
    message.role === "assistant" && message.purpose === "assistant"
      ? message.parts.flatMap((part, partIndex) =>
          part.type === "dynamic-tool" &&
          part.toolName === draftPetrinautExperimentToolName &&
          part.toolCallId === draftCallId
            ? [{ messageIndex, partIndex }]
            : [],
        )
      : [],
  );
  const position = positions[0];
  if (positions.length !== 1 || position === undefined)
    throw new Error(
      "The issued experiment draft is absent or ambiguous in this conversation.",
    );
  const message = snapshot.messages[position.messageIndex];
  if (message === undefined)
    throw new Error("The experiment draft history is incomplete.");
  const prefix = {
    ...snapshot,
    messages: [
      ...snapshot.messages.slice(0, position.messageIndex),
      { ...message, parts: message.parts.slice(0, position.partIndex) },
    ],
  } satisfies FlueConversationSnapshot;
  const events = await deriveNetLedger(prefix, browser);
  const relevant = events.filter(
    (event) =>
      event.kind === "read" ||
      event.kind === "mutation" ||
      event.kind === "construction" ||
      event.kind === "layout" ||
      event.kind === "unrecorded",
  );
  const latest = relevant.at(-1);
  if (latest?.kind !== "read")
    throw new Error(
      "Experiment draft needs a latest verified canonical net read after all changes.",
    );
  const readCall =
    prefix.messages[latest.position.messageIndex]?.parts[
      latest.position.partIndex
    ];
  if (
    readCall?.type !== "dynamic-tool" ||
    readCall.toolName !== getLatestNetDefinitionToolName
  )
    throw new Error(
      "Experiment draft needs a canonical getLatestNetDefinition read.",
    );
  return latest.observation;
};
