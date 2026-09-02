/**
 * Client-tool hosts for the Pi persona harness.
 *
 * The production `ChatAgent` may defer a tool call to its client, which in the
 * product is the browser. When the persona harness is that client, one of
 * these hosts services the call so the bridge can resume Brunch with the
 * existing `client-tool-result` signal. Selecting a host mounts no tool and
 * changes no production composition; it only answers calls the real agent
 * emits.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { READ_PETRINAUT_DOC_TOOL_NAME } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { readPetrinautDocToolInputSchema } from "@hashintel/petrinaut-core";

import {
  createHeadlessPetrinautClient,
  isPetrinautConstructionToolName,
} from "../runbook/headless-petrinaut-client.ts";

export type BrunchToolExecutor = "server" | "mock" | "real-headless";

/** The Pi flag that selects a host, named here so the bridge's failure message can cite it. */
export const TOOL_HOST_FLAG = "brunch-tool-host";

export interface BrunchClientToolCall {
  readonly submissionId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
}

export interface BrunchClientToolHost {
  readonly kind: Exclude<BrunchToolExecutor, "server">;
  execute(call: BrunchClientToolCall): Promise<unknown>;
  dispose?(): void | Promise<void>;
}

export interface MockBrunchClientToolCall {
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
}

export const createMockClientToolHost = (
  calls: readonly MockBrunchClientToolCall[],
): BrunchClientToolHost => {
  let nextCallIndex = 0;

  return {
    kind: "mock",
    async execute(call) {
      const expected = calls[nextCallIndex];
      if (expected === undefined) {
        throw new Error(
          `Mock client-tool fixture has no call ${nextCallIndex + 1}; received ${call.toolName}`,
        );
      }
      if (
        expected.toolName !== call.toolName ||
        !isDeepStrictEqual(expected.input, call.input)
      ) {
        throw new Error(
          `Mock client-tool call ${nextCallIndex + 1} mismatch: expected ${expected.toolName} ${JSON.stringify(expected.input)}, received ${call.toolName} ${JSON.stringify(call.input)}`,
        );
      }

      nextCallIndex += 1;
      return expected.output;
    },
  };
};

const stripImages = (markdown: string): string =>
  markdown
    .replace(/<img\b[^>]*\/?>(?:\s*<\/img>)?/giu, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\n{3,}/gu, "\n\n");

/**
 * The checked-out Petrinaut user guide, read from the repository rather than
 * imported: the Brunch server stays independent of the Petrinaut UI package.
 */
const petrinautDocsRoot = new URL(
  "../../../../../libs/@hashintel/petrinaut/docs/",
  import.meta.url,
);

export const createRealHeadlessClientToolHost = (
  title: string,
): BrunchClientToolHost => {
  const petrinautClient = createHeadlessPetrinautClient(title);

  return {
    kind: "real-headless",
    async execute(call) {
      if (call.toolName === READ_PETRINAUT_DOC_TOOL_NAME) {
        const { doc } = readPetrinautDocToolInputSchema.parse(call.input);
        const markdown = await readFile(
          new URL(`${doc}.md`, petrinautDocsRoot),
          "utf8",
        );
        return stripImages(markdown);
      }

      if (isPetrinautConstructionToolName(call.toolName)) {
        const result = await petrinautClient.execute(call);
        return result.output;
      }

      throw new Error(
        `Real headless client-tool host does not support ${call.toolName}`,
      );
    },
    dispose: petrinautClient.dispose,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Reads an ordered mock fixture; the path resolves against the working directory. */
export const readMockCalls = (
  path: string,
): readonly MockBrunchClientToolCall[] => {
  const absolutePath = resolve(process.cwd(), path);
  const value: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (!isRecord(value) || !Array.isArray(value["calls"])) {
    throw new Error(
      `Mock client-tool fixture ${absolutePath} must contain a calls array`,
    );
  }

  return value["calls"].map((call, index) => {
    if (
      !isRecord(call) ||
      typeof call["toolName"] !== "string" ||
      !Object.hasOwn(call, "input") ||
      !Object.hasOwn(call, "output")
    ) {
      throw new Error(
        `Mock client-tool fixture ${absolutePath} call ${index + 1} must contain toolName, input, and output`,
      );
    }
    return {
      toolName: call["toolName"],
      input: call["input"],
      output: call["output"],
    };
  });
};
