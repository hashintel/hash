import assert from "node:assert/strict";

import { checkDefinition } from "@hashintel/petrinaut-core/diagnostics";

import { formatFlueTranscript } from "../../conversation/transcript.ts";
import { PersonaBrowserTurnError } from "../persona/browser-turn.ts";
import { openPersonaConversation } from "../persona/launch/browser.ts";

import type {
  EvaluationArm,
  MatchedParityConfiguration,
} from "./configuration.ts";
import type { MatchedParityScenario } from "./scenarios.ts";
import type { CapturedToolCall, MatchedParityArtifact } from "./summary.ts";
import type { FlueConversationSnapshot } from "@flue/sdk";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { BrowserContext, Page, Request } from "@playwright/test";

const assistantStorageKey = "petrinaut-website:assistant";
const documentsStorageKey = "petrinaut-sdcpn";
const messagesStorageKey = "petrinaut-ai-messages";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const partsFrom = (messages: readonly unknown[]): readonly unknown[] =>
  messages.flatMap((message): readonly unknown[] =>
    record(message) && Array.isArray(message.parts)
      ? (message.parts as unknown[])
      : [],
  );

export const toolCallsFromMessages = (
  messages: readonly unknown[],
): CapturedToolCall[] =>
  partsFrom(messages).flatMap((part) => {
    if (!record(part) || typeof part.type !== "string") return [];
    const name =
      part.type === "dynamic-tool" && typeof part.toolName === "string"
        ? part.toolName
        : part.type.startsWith("tool-")
          ? part.type.slice("tool-".length)
          : undefined;
    if (name === undefined) return [];
    return [
      {
        name,
        state: typeof part.state === "string" ? part.state : "unknown",
        ...(typeof part.toolCallId === "string"
          ? { toolCallId: part.toolCallId }
          : {}),
      },
    ];
  });

const diagnosticMessage = (message: unknown): string => {
  if (typeof message === "string") return message;
  if (!record(message)) return String(message);
  const current =
    typeof message.messageText === "string" ? message.messageText : "";
  const next = Array.isArray(message.next)
    ? message.next.map(diagnosticMessage).filter(Boolean)
    : [];
  return [current, ...next].filter(Boolean).join("\n");
};

const captureDiagnostics = (sdcpn: SDCPN) => {
  const result = checkDefinition(sdcpn);
  return {
    isValid: result.isValid,
    itemDiagnostics: result.itemDiagnostics.map((item) => ({
      itemId: item.itemId,
      itemType: item.itemType,
      filePath: item.filePath,
      diagnostics: item.diagnostics.map((diagnostic) => ({
        category: diagnostic.category,
        code: diagnostic.code,
        start: diagnostic.start,
        length: diagnostic.length,
        message: diagnosticMessage(diagnostic.messageText),
      })),
    })),
  };
};

const visibleTranscript = async (page: Page): Promise<string> =>
  page
    .getByRole("dialog")
    .filter({
      has: page.getByRole("textbox", { name: "Message AI assistant" }),
    })
    .innerText()
    .catch(() => page.locator("body").innerText());

const readBrowserState = async (page: Page) =>
  page.evaluate(
    ({ documentKey, messageKey }) => ({
      documents: localStorage.getItem(documentKey),
      messages: localStorage.getItem(messageKey),
    }),
    { documentKey: documentsStorageKey, messageKey: messagesStorageKey },
  );

const parseOneDocument = (raw: string | null) => {
  const parsed: unknown = raw === null ? undefined : JSON.parse(raw);
  assert(record(parsed), "Petrinaut did not retain a document envelope");
  const documents = Object.values(parsed).filter(record);
  assert.equal(documents.length, 1, "Expected exactly one fresh document");
  const document = documents[0];
  assert(document);
  assert(typeof document.title === "string");
  assert(record(document.sdcpn));
  return document as {
    readonly title: string;
    readonly sdcpn: SDCPN & Record<string, unknown>;
  } & Record<string, unknown>;
};

const parseStoredMessages = (raw: string | null): readonly unknown[] => {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!record(parsed)) return [];
  return Object.values(parsed).flatMap((messages): readonly unknown[] =>
    Array.isArray(messages) ? (messages as unknown[]) : [],
  );
};

const openPanel = async (page: Page, origin: string) => {
  await page.goto(origin);
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour.waitFor();
  await skipTour.click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
};

const submitStockTurn = async (
  page: Page,
  prompt: string,
  signal: AbortSignal,
): Promise<number> => {
  const composer = page.getByRole("textbox", {
    name: "Message AI assistant",
    exact: true,
  });
  const stop = page.getByRole("button", {
    name: "Stop AI response",
    exact: true,
  });
  let modelSteps = 0;
  const countModelStep = (request: Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/chat"
    )
      modelSteps += 1;
  };
  page.on("request", countModelStep);
  signal.throwIfAborted();
  await composer.fill(prompt);
  await composer.press("Enter");
  const abort = () => void stop.click({ timeout: 2_000 }).catch(() => {});
  signal.addEventListener("abort", abort, { once: true });
  try {
    await stop.waitFor({ state: "visible", timeout: 15_000 });
    await stop.waitFor({ state: "hidden", timeout: 0 });
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", abort);
    page.off("request", countModelStep);
  }
  return modelSteps;
};

const flueMessages = (snapshot: FlueConversationSnapshot): readonly unknown[] =>
  snapshot.messages.map((message) => ({
    ...message,
    role: message.purpose === "assistant" ? "assistant" : message.purpose,
  }));

const usageCost = (message: unknown): number | undefined => {
  if (!record(message)) return undefined;
  const metadata = record(message.metadata) ? message.metadata : undefined;
  const usage = record(message.usage)
    ? message.usage
    : metadata !== undefined && record(metadata.usage)
      ? metadata.usage
      : undefined;
  if (usage === undefined || !record(usage.cost)) return undefined;
  const total = usage.cost.total;
  return typeof total === "number" && Number.isFinite(total) && total >= 0
    ? total
    : undefined;
};

/** Sum only explicit provider-reported catalogue costs; absence stays unknown. */
export const observedSpendFromMessages = (
  messages: readonly unknown[],
): number | null => {
  const costs = messages.flatMap((message) => {
    const cost = usageCost(message);
    return cost === undefined ? [] : [cost];
  });
  return costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0);
};

export interface BrowserArmResult {
  readonly artifact: MatchedParityArtifact;
  readonly rawDocument: unknown;
  readonly rawTranscript: unknown;
  readonly transcriptText: string;
  readonly flueSnapshot?: FlueConversationSnapshot;
}

/** One isolated product run. Callers create and close contexts serially. */
const describeError = (error: unknown): unknown =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        ...(error.cause === undefined
          ? {}
          : { cause: describeError(error.cause) }),
      }
    : error;

export interface BrowserArmFailureReport {
  readonly arm: EvaluationArm;
  readonly scenarioId: string;
  readonly failedAt: string;
  readonly elapsedMs: number;
  readonly error: unknown;
  readonly browserFailures: readonly string[];
  readonly visibleState: string;
  readonly documents?: unknown;
  readonly flueSnapshot?: FlueConversationSnapshot;
}

/** A failed arm keeps everything observable about the failure for a diagnosis artifact. */
export class BrowserArmFailure extends Error {
  readonly report: BrowserArmFailureReport;
  constructor(
    message: string,
    options: { cause: unknown; report: BrowserArmFailureReport },
  ) {
    super(message, { cause: options.cause });
    this.name = "BrowserArmFailure";
    this.report = options.report;
  }
}

export const runBrowserArm = async (input: {
  readonly arm: EvaluationArm;
  readonly configuration: MatchedParityConfiguration;
  readonly context: BrowserContext;
  readonly origin: string;
  readonly scenario: MatchedParityScenario;
}): Promise<BrowserArmResult> => {
  const { arm, configuration, context, origin, scenario } = input;
  const armConfiguration = configuration.arms[arm];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: assistantStorageKey, value: armConfiguration.assistant },
  );
  const page = await context.newPage();
  const browserFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      browserFailures.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) =>
    browserFailures.push(`pageerror: ${error.message}`),
  );
  const timeout = AbortSignal.timeout(configuration.maxTurnMs);
  const started = performance.now();
  let flueSnapshot: FlueConversationSnapshot | undefined;
  let transcriptText: string;
  let rawTranscript: unknown;
  let modelStepCount: number;

  try {
    if (armConfiguration.assistant === "brunch") {
      const result = await openPersonaConversation(
        page,
        origin,
        scenario.prompt,
        {
          signal: timeout,
        },
      );
      flueSnapshot = result.snapshot;
      modelStepCount = result.submissionIds.length;
      rawTranscript = result.snapshot;
      transcriptText = formatFlueTranscript(result.snapshot);
    } else {
      await openPanel(page, origin);
      modelStepCount = await submitStockTurn(page, scenario.prompt, timeout);
      const state = await readBrowserState(page);
      rawTranscript = parseStoredMessages(state.messages);
      transcriptText = await visibleTranscript(page);
    }
  } catch (error) {
    const visibleState = await page
      .locator("body")
      .innerText()
      .catch(() => "Browser body unavailable");
    const browserState = await readBrowserState(page).catch(() => undefined);
    throw new BrowserArmFailure(
      [
        `${arm} browser arm failed.`,
        ...browserFailures,
        "Visible browser state:",
        visibleState.slice(-4_000),
      ].join("\n"),
      {
        cause: error,
        report: {
          arm,
          scenarioId: scenario.id,
          failedAt: new Date().toISOString(),
          elapsedMs: Math.round(performance.now() - started),
          error: describeError(error),
          browserFailures,
          visibleState,
          documents: browserState?.documents,
          ...(error instanceof PersonaBrowserTurnError
            ? { flueSnapshot: error.snapshot }
            : {}),
        },
      },
    );
  }
  const elapsedMs = Math.round(performance.now() - started);
  const state = await readBrowserState(page);
  const rawDocument = parseOneDocument(state.documents);
  const messages =
    flueSnapshot === undefined
      ? parseStoredMessages(state.messages)
      : flueMessages(flueSnapshot);
  const diagnostics = captureDiagnostics(rawDocument.sdcpn);
  const artifact: MatchedParityArtifact = {
    schemaVersion: 2,
    arm,
    mode: arm,
    configuration,
    diagnostics,
    document: {
      title: rawDocument.title,
      sdcpn: rawDocument.sdcpn,
    },
    elapsedMs,
    modelStepCount,
    scenario,
    spend: { observedUsd: observedSpendFromMessages(messages) },
    toolCalls: toolCallsFromMessages(messages),
  };
  return {
    artifact,
    rawDocument,
    rawTranscript,
    transcriptText,
    ...(flueSnapshot === undefined ? {} : { flueSnapshot }),
  };
};
