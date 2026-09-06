/** Recover Mission 3 workpieces from a Flue `history()` snapshot. */

import { basename } from "node:path";

import { sha256 } from "./campaign-integrity.ts";

import type { FlueConversationPart, FlueConversationSnapshot } from "@flue/sdk";

export const RUNBOOK_IR_FENCE = "runbook-ir";

const runbookIrFencePattern = /```runbook-ir\s*\n([\s\S]*?)```/g;

export const latestRunbookIrBlock = (text: string): string | undefined => {
  const matches = [...text.matchAll(runbookIrFencePattern)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? undefined : last.trim();
};

export const recoverRunbookIr = (
  snapshot: FlueConversationSnapshot,
): string | undefined => recoverRunbookWorkpiece(snapshot)?.content;

export interface RecoveredRunbookWorkpiece {
  readonly content: string;
  readonly sha256: string;
  readonly sourceMessageId: string;
  readonly sourceMessageSha256: string;
}

export const recoverRunbookWorkpiece = (
  snapshot: FlueConversationSnapshot,
): RecoveredRunbookWorkpiece | undefined => {
  let recovered: RecoveredRunbookWorkpiece | undefined;
  for (const message of snapshot.messages) {
    if (message.purpose !== "assistant") continue;
    const text = message.parts
      .filter(
        (part): part is Extract<FlueConversationPart, { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("\n");
    const content = latestRunbookIrBlock(text);
    if (content === undefined) continue;
    recovered = {
      content,
      sha256: sha256(content),
      sourceMessageId: message.id,
      sourceMessageSha256: sha256(JSON.stringify(message)),
    };
  }
  return recovered;
};

export const interviewerToolNamesFrom = (
  snapshot: FlueConversationSnapshot,
): readonly string[] => [
  ...new Set(
    snapshot.messages.flatMap((message) =>
      message.parts
        .filter((part) => part.type === "dynamic-tool")
        .map((part) => part.toolName),
    ),
  ),
];

export const skillResourcePathsFrom = (
  snapshot: FlueConversationSnapshot,
): readonly string[] =>
  snapshot.messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type !== "dynamic-tool") return [];
      if (part.toolName !== "read_skill_resource") return [];
      if (part.state !== "output-available") return [];
      if (
        typeof part.input !== "object" ||
        part.input === null ||
        !("path" in part.input) ||
        typeof part.input.path !== "string"
      ) {
        return [];
      }
      return [part.input.path];
    }),
  );

export interface OrdinaryElicitationViolation {
  readonly code:
    | "capture-tool-use"
    | "construction-resource-read"
    | "construction-tool-use"
    | "late-required-resource"
    | "missing-required-resource"
    | "missing-workpiece"
    | "multiple-questions"
    | "unexpected-resource-read"
    | "unexpected-tool-use";
  readonly detail: string;
}

const ORDINARY_TOOL_NAMES = new Set(["activate_skill", "read_skill_resource"]);
const CONSTRUCTION_TOOL_NAMES = new Set([
  "getLatestNetDefinition",
  "addType",
  "addParameter",
  "addPlace",
  "addTransition",
  "addArc",
]);
const CAPTURE_TOOL_NAMES = new Set(["brunch_ask", "brunch_sweep"]);
const ORDINARY_RESOURCE_NAMES = new Set(["profile.md", "workpiece.md"]);
const CONSTRUCTION_RESOURCE_NAMES = new Set([
  "pn-construction.md",
  "checks.md",
]);

const interactiveTextFrom = (text: string): string =>
  text.replace(/```runbook-ir\s*\n[\s\S]*?```/gu, "");

export const ordinaryElicitationViolationsFrom = (
  snapshot: FlueConversationSnapshot,
  options: { readonly hasWorkpiece: boolean },
): readonly OrdinaryElicitationViolation[] => {
  const violations: OrdinaryElicitationViolation[] = [];
  const successfulResourcePositions = new Map<string, number>();
  let firstQuestionPosition: number | undefined;
  let firstWorkpiecePosition: number | undefined;
  let position = 0;

  for (const message of snapshot.messages) {
    if (message.purpose === "assistant") {
      const questionCount = message.parts.reduce((count, part) => {
        if (part.type !== "text") return count;
        const interactiveText = interactiveTextFrom(part.text);
        return count + (interactiveText.match(/\?/gu)?.length ?? 0);
      }, 0);
      if (questionCount > 1) {
        violations.push({
          code: "multiple-questions",
          detail: `${message.id}: ${questionCount} question marks`,
        });
      }
    }
    for (const part of message.parts) {
      position += 1;
      if (message.purpose !== "assistant") continue;
      if (part.type === "text") {
        if (
          firstQuestionPosition === undefined &&
          interactiveTextFrom(part.text).includes("?")
        ) {
          firstQuestionPosition = position;
        }
        if (
          firstWorkpiecePosition === undefined &&
          part.text.includes(`\`\`\`${RUNBOOK_IR_FENCE}`)
        ) {
          firstWorkpiecePosition = position;
        }
        continue;
      }
      if (
        part.type !== "dynamic-tool" ||
        part.toolName !== "read_skill_resource" ||
        part.state !== "output-available" ||
        typeof part.input !== "object" ||
        part.input === null ||
        !("path" in part.input) ||
        typeof part.input.path !== "string"
      ) {
        continue;
      }
      const resourceName = basename(part.input.path);
      if (!successfulResourcePositions.has(resourceName)) {
        successfulResourcePositions.set(resourceName, position);
      }
    }
  }

  for (const toolName of interviewerToolNamesFrom(snapshot)) {
    if (ORDINARY_TOOL_NAMES.has(toolName)) continue;
    violations.push({
      code: CONSTRUCTION_TOOL_NAMES.has(toolName)
        ? "construction-tool-use"
        : CAPTURE_TOOL_NAMES.has(toolName)
          ? "capture-tool-use"
          : "unexpected-tool-use",
      detail: toolName,
    });
  }
  for (const path of skillResourcePathsFrom(snapshot)) {
    const name = basename(path);
    if (ORDINARY_RESOURCE_NAMES.has(name)) continue;
    violations.push({
      code: CONSTRUCTION_RESOURCE_NAMES.has(name)
        ? "construction-resource-read"
        : "unexpected-resource-read",
      detail: path,
    });
  }

  const requireResourceBefore = (
    resourceName: string,
    boundary: number | undefined,
    boundaryDescription: string,
  ): void => {
    const resourcePosition = successfulResourcePositions.get(resourceName);
    if (resourcePosition === undefined) {
      violations.push({
        code: "missing-required-resource",
        detail: resourceName,
      });
    } else if (boundary !== undefined && resourcePosition > boundary) {
      violations.push({
        code: "late-required-resource",
        detail: `${resourceName}: after ${boundaryDescription}`,
      });
    }
  };

  requireResourceBefore("profile.md", firstQuestionPosition, "first question");
  if (options.hasWorkpiece) {
    requireResourceBefore(
      "workpiece.md",
      firstWorkpiecePosition,
      "first workpiece",
    );
  } else {
    violations.push({
      code: "missing-workpiece",
      detail: "No recoverable runbook-ir workpiece was emitted.",
    });
  }
  return violations;
};
