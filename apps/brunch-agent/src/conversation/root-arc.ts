import { createHash } from "node:crypto";

import {
  canonicalContent,
  parseJoinedRootArcInput,
  reconcileArcTransitionAttempts,
  verifyArcTransitionAttempt,
  type ArcMutationRequest,
  type ArcTransitionAttempt,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";

import { isAwaitingClient } from "./client-tools.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const record = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

/** Historical citations resolve only actual successful core tool calls, never fenced recovery. */
export const retainedSettledRevision = (
  snapshot: FlueConversationSnapshot,
  revisionId: string,
): WorkpieceRevision | undefined => {
  for (const message of snapshot.messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (
        part.type !== "dynamic-tool" ||
        part.toolName !== "update_workpiece" ||
        part.toolCallId !== revisionId ||
        part.state !== "output-available"
      )
        continue;
      if (
        !record(part.input) ||
        typeof part.input.markdown !== "string" ||
        !record(part.output)
      )
        continue;
      const { markdown } = part.input;
      const { sha256, ordinal } = part.output;
      if (
        part.output.revisionId !== revisionId ||
        typeof sha256 !== "string" ||
        typeof ordinal !== "number" ||
        createHash("sha256").update(markdown).digest("hex") !== sha256
      )
        continue;
      return {
        revisionId,
        sha256,
        ordinal,
        markdown,
        ...(part.output.evidenceValidated === true
          ? {
              evidence: part.output.evidence as WorkpieceRevision["evidence"],
              evidenceValidated: true as const,
            }
          : {}),
      };
    }
  }
  return undefined;
};

/** Verify the incoming sidecar against this instance's issued canonical call before model continuation. */
export const verifyRootArcResults = async (input: {
  body: string;
  snapshot: FlueConversationSnapshot;
  binding: ArcMutationRequest["binding"];
  requestedBaseHash: string;
}): Promise<void> => {
  const deliveries: unknown = JSON.parse(input.body);
  if (!Array.isArray(deliveries)) throw new Error("Malformed browser results.");
  const history = clientToolHistoryFrom(input.snapshot.messages);
  await Promise.all(
    deliveries.map(async (delivery: unknown) => {
      if (
        !record(delivery) ||
        typeof delivery.toolCallId !== "string" ||
        typeof delivery.toolName !== "string" ||
        !("output" in delivery)
      )
        throw new Error("Malformed browser result identity.");
      const call = input.snapshot.messages
        .flatMap((message) => message.parts)
        .find(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId === delivery.toolCallId,
        );
      if (
        !call ||
        call.type !== "dynamic-tool" ||
        call.toolName !== delivery.toolName ||
        call.state !== "output-available" ||
        !isAwaitingClient(call.output)
      )
        throw new Error(
          "The browser result has no matching admitted canonical call.",
        );
      if (call.toolName !== "addArc") return;
      const { brunch, ...canonicalInput } = parseJoinedRootArcInput(call.input);
      const expected: ArcMutationRequest = {
        toolCallId: call.toolCallId,
        toolName: "addArc",
        input: canonicalInput,
        binding: input.binding,
        requestedBaseHash: brunch.requestedBaseHash,
      };
      if (expected.requestedBaseHash !== input.requestedBaseHash)
        throw new Error(
          "The issued browser base does not match the bound conversation.",
        );
      if (
        !record(delivery.metadata) ||
        !record(delivery.metadata.transitionRecord) ||
        !Array.isArray(delivery.metadata.transitionRecord.attempts)
      )
        throw new Error(
          "The root arc result requires a browser transition record.",
        );
      const attempts = await Promise.all(
        delivery.metadata.transitionRecord.attempts.map(
          async (attempt: unknown) => {
            // The plugin's receiving-boundary verifier validates detached observations and effects.
            const verified = await verifyArcTransitionAttempt(
              attempt as ArcTransitionAttempt,
            );
            if (
              canonicalContent(verified.request) !==
                canonicalContent(expected) ||
              canonicalContent(verified.binding) !==
                canonicalContent(input.binding)
            )
              throw new Error(
                "The browser record does not match the issued call or document incarnation.",
              );
            return verified;
          },
        ),
      );
      const reconciled = reconcileArcTransitionAttempts(attempts);
      if (reconciled.outcome !== delivery.metadata.transitionRecord.outcome)
        throw new Error("The browser aggregate outcome is inconsistent.");
      if (
        record(delivery.output) &&
        ((delivery.output.applied === true &&
          reconciled.outcome !== "applied") ||
          (delivery.output.applied === false &&
            reconciled.outcome === "applied"))
      )
        throw new Error(
          "The canonical result conflicts with the observed browser outcome.",
        );
      const earlier = history.results.filter(
        (result) => result.toolCallId === call.toolCallId,
      );
      if (earlier.length > 1)
        throw new Error(
          "This browser call already has a result delivery; do not continue or reapply it.",
        );
    }),
  );
};
