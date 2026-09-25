import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";
import { agentOwnershipHeaders } from "@hashintel/brunch-agent-transport-aisdk";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import type { ProcessAgentBinding } from "./assistants/brunch/use-process-agent-binding";
import type { FlueClient } from "@flue/sdk";
import type { ClientToolResultMetadata } from "@hashintel/brunch-agent-plugin-sdcpn";

/** The callback crosses the same single-owner HTTP process that is running the Flue tool. */
export const createInBandBrowserCalls = (input: {
  readonly client: Promise<FlueClient>;
  readonly principalKey: string;
  readonly binding: ProcessAgentBinding;
  readonly metadataFor: (
    toolCallId: string,
    output: unknown,
  ) => Promise<ClientToolResultMetadata | undefined>;
  readonly prepareInput: (call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }) => void;
}) => ({
  has: (toolName: string) => toolName in petrinautAiTools,
  claim: async (call: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly input: unknown;
    readonly signal: AbortSignal;
  }) => {
    const client = await input.client;
    const url = `${client.url}/browser-calls/${encodeURIComponent(call.toolCallId)}`;
    const boundClaimUrl = `${url}?binding=${encodeURIComponent(canonicalContent(input.binding))}`;
    const headers = agentOwnershipHeaders({
      principalKey: input.principalKey,
      conversationId: input.binding.conversationId,
    });
    const claimSignal = AbortSignal.any([
      call.signal,
      AbortSignal.timeout(6_000),
    ]);
    let issued:
      | {
          capability: string;
          binding: string;
          toolName: string;
          input: unknown;
        }
      | undefined;
    while (!claimSignal.aborted) {
      const response = await fetch(boundClaimUrl, {
        headers,
        signal: claimSignal,
      });
      if (response.ok) {
        issued = (await response.json()) as typeof issued;
        break;
      }
      if (response.status !== 404)
        throw new Error(`Browser call claim refused (${response.status}).`);
      await new Promise<void>((resolve, reject) => {
        let onAbort = () => {};
        const timeout = setTimeout(() => {
          claimSignal.removeEventListener("abort", onAbort);
          resolve();
        }, 75);
        onAbort = () => {
          clearTimeout(timeout);
          reject(claimSignal.reason);
        };
        claimSignal.addEventListener("abort", onAbort, { once: true });
      });
    }
    if (
      !issued ||
      issued.toolName !== call.toolName ||
      issued.binding !== canonicalContent(input.binding) ||
      !(call.toolName in petrinautAiTools)
    )
      throw new Error(
        "Browser call was not issued for this document incarnation.",
      );
    const canonicalInput = petrinautAiTools[
      call.toolName as keyof typeof petrinautAiTools
    ].inputSchema.parse(call.input);
    if (canonicalContent(canonicalInput) !== canonicalContent(issued.input))
      throw new Error("Issued browser input does not match the admitted call.");
    const claimed = issued;
    const lease = setInterval(() => {
      if (call.signal.aborted) return;
      void fetch(`${url}/lease`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          capability: claimed.capability,
          binding: claimed.binding,
        }),
        signal: call.signal,
      }).catch(() => {});
    }, 5_000);
    call.signal.addEventListener("abort", () => clearInterval(lease), {
      once: true,
    });
    return {
      input: claimed.input,
      prepare: () =>
        input.prepareInput({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: claimed.input,
        }),
      release: () => clearInterval(lease),
      fail: async (disposition: "unstarted" | "failed" = "failed") => {
        clearInterval(lease);
        if (call.signal.aborted) return;
        const response = await fetch(`${url}/fail`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            capability: claimed.capability,
            binding: claimed.binding,
            toolName: call.toolName,
            canonicalInput: claimed.input,
            disposition,
          }),
          signal: call.signal,
        });
        if (!response.ok)
          throw new Error(
            `Browser call failure was not accepted (${response.status}).`,
          );
      },
      submit: async (output: unknown) => {
        clearInterval(lease);
        if (call.signal.aborted) return;
        const metadata = await input.metadataFor(call.toolCallId, output);
        const response = await fetch(url, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            capability: claimed.capability,
            binding: claimed.binding,
            toolName: call.toolName,
            canonicalInput: claimed.input,
            output,
            ...(metadata === undefined ? {} : { metadata }),
          }),
          signal: call.signal,
        });
        if (!response.ok)
          throw new Error(
            `Browser call result was not accepted (${response.status}); effect may be unknown.`,
          );
      },
    };
  },
});
