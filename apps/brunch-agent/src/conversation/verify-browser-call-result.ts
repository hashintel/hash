import {
  canonicalContent,
  isHostRecordedCanonicalMutation,
  parseClientToolResultMetadata,
  verifyCanonicalMutationRecord,
  verifyDefinitionObservation,
  verifyExperimentRecord,
  type BrowserBinding,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createExperimentToolName,
  getLatestNetDefinitionToolName,
} from "@hashintel/petrinaut-core";

import type { ClientToolResult } from "@hashintel/brunch-agent-transport-aisdk";

/** Verify the host sidecar against the issued Flue call before it can appear as a settled outcome. */
export const verifyBrowserCallResult = async (input: {
  readonly call: ClientToolResult;
  readonly canonicalInput: unknown;
  readonly binding: BrowserBinding;
}): Promise<ReturnType<typeof parseClientToolResultMetadata>> => {
  const { call, binding, canonicalInput } = input;
  const metadata = parseClientToolResultMetadata(call.metadata);
  if (call.metadata !== undefined && metadata === undefined)
    throw new Error(
      "The browser result has an invalid host sidecar; the effect is unknown.",
    );
  if (call.toolName === getLatestNetDefinitionToolName) {
    const record = metadata?.observation;
    if (
      !record ||
      record.toolCallId !== call.toolCallId ||
      canonicalContent(record.binding) !== canonicalContent(binding)
    )
      throw new Error("The browser read has no correlated observation.");
    const observed = await verifyDefinitionObservation(record.observed);
    if (
      typeof call.output !== "object" ||
      call.output === null ||
      !("definition" in call.output) ||
      canonicalContent(call.output.definition) !==
        canonicalContent(observed.definition)
    )
      throw new Error(
        "The browser read differs from its verified observation.",
      );
  }
  if (call.toolName === createExperimentToolName) {
    await verifyExperimentRecord({
      record: metadata?.experimentRecord,
      toolCallId: call.toolCallId,
      canonicalInput,
      canonicalOutput: call.output,
      binding,
    });
  }
  const hostRecordedMutation = isHostRecordedCanonicalMutation(
    call.toolName,
    canonicalInput,
  );
  if (hostRecordedMutation && metadata?.canonicalMutationRecord === undefined)
    throw new Error(
      "The issued root mutation has no correlated canonical mutation record; its effect is unknown.",
    );
  if (metadata?.canonicalMutationRecord !== undefined) {
    if (!hostRecordedMutation)
      throw new Error(
        "An unrecorded canonical call cannot claim a root mutation cause.",
      );
    await verifyCanonicalMutationRecord({
      record: metadata.canonicalMutationRecord,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      canonicalInput,
      canonicalOutput: call.output,
      binding,
    });
  }
  return metadata;
};
