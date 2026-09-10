import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { z } from "zod";

import {
  composeCaptureWav,
  readWavHeader,
  synthesizeUtterance,
} from "./synthesize-utterance.ts";
import { checkTrace } from "./trace-checks.ts";

import type {
  DiagnosticLine,
  InputCommit,
  LatencyMark,
  Scenario,
  Trace,
} from "./trace-checks.ts";

class HarnessError extends Error {}

declare global {
  interface Window {
    __voiceE2E: {
      readonly commits: InputCommit[];
      readonly latency: LatencyMark[];
      readonly error?: string;
      readonly microphoneRequestedAt?: number;
      readonly recordedMs: number;
      stopRecording: () => Promise<string>;
    };
  }
}

const scenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/u),
    utterance: z.string().min(1),
    expectInputPhrases: z.array(z.string().min(1)).min(1),
    budgetsMs: z.object({
      speechEndToAckAudio: z.number().positive(),
      readyToTtsAudio: z.number().positive(),
    }),
    action: z
      .enum(["take-turn-during-paraphrase", "follow-up-while-working"])
      .optional(),
    allowNotHeard: z.boolean().optional(),
    expectUnchangedRevision: z.boolean().optional(),
    followUp: z
      .object({
        utterance: z.string().min(1),
        expectInputPhrases: z.array(z.string().min(1)).min(1),
        delaySeconds: z.number().int().min(3),
      })
      .optional(),
  })
  .strict();

const diagnosticSchema = z.object({
  operation: z.enum(["connection", "transcription", "speech"]),
  outcome: z.enum(["success", "failure", "aborted"]),
  durationMs: z.number().nonnegative(),
  requestId: z
    .string()
    .regex(/^[a-zA-Z0-9-]*$/u)
    .max(128),
  stage: z.enum(["browser", "playback", "server"]),
  errorCode: z
    .enum([
      "microphone-permission",
      "microphone-device",
      "request-aborted",
      "network",
      "timeout",
      "invalid-response",
      "unavailable",
    ])
    .optional(),
  status: z.number().int().optional(),
  speechKind: z
    .enum([
      "acknowledgement",
      "bridging",
      "exact-read",
      "paraphrase",
      "progress",
    ])
    .optional(),
});

const websiteUrl = process.env.VOICE_E2E_WEBSITE_URL ?? "http://127.0.0.1:4321";
const outRoot = resolve(
  process.env.VOICE_E2E_OUT ??
    fileURLToPath(
      new URL(
        "../../../../libs/@hashintel/brunch-agent/docs/evidence/evaluations/voice-e2e",
        import.meta.url,
      ),
    ),
);
const inputDirectory = process.env.VOICE_E2E_INPUT_DIR;

const preflight = async (): Promise<void> => {
  if (process.env.CI)
    throw new HarnessError(
      "Voice E2E is paid, on-demand tooling and must never run in CI",
    );
  if (process.env.VOICE_E2E_APPROVED !== "true")
    throw new HarnessError(
      "Paid run: set VOICE_E2E_APPROVED=true only with owner approval; $5 aggregate cap",
    );
  const url = new URL(websiteUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new HarnessError(
      "Use a local website with disposable local Brunch data",
    );
  const config = await fetch(new URL("/api/voice/config", websiteUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  if (config.status !== 200)
    throw new HarnessError(
      `Voice config unavailable (HTTP ${config.status}); start the website with Voice enabled`,
    );
  const availability = z
    .object({ available: z.literal(true) })
    .safeParse(await config.json());
  if (!availability.success)
    throw new HarnessError(
      "Voice config returned 200 but Voice is not available",
    );
  const brunchUrl = new URL(
    process.env.BRUNCH_CHAT_ORIGIN ?? "http://127.0.0.1:4322",
  );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(brunchUrl.hostname))
    throw new HarnessError("Brunch must use disposable local data");
  const health = await fetch(new URL("/health", brunchUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  if (health.status !== 200)
    throw new HarnessError(
      `Local Brunch health failed (HTTP ${health.status})`,
    );
};

const prepareAudio = async (
  scenario: Scenario,
  runDir: string,
): Promise<string> => {
  const utterances = [{ text: scenario.utterance, name: scenario.id }];
  if (scenario.followUp)
    utterances.push({
      text: scenario.followUp.utterance,
      name: `${scenario.id}-follow-up`,
    });
  const inputs: Uint8Array[] = [];
  for (const utterance of utterances) {
    const path = inputDirectory
      ? resolve(inputDirectory, `${utterance.name}.wav`)
      : join(runDir, `${utterance.name}.wav`);
    if (!inputDirectory) {
      if (process.platform !== "darwin")
        throw new HarnessError(
          "macOS say is unavailable. Supply macOS-generated WAVs with VOICE_E2E_INPUT_DIR (see --prepare-fixtures)",
        );
      await synthesizeUtterance(utterance.text, path);
    }
    inputs.push(new Uint8Array(await readFile(path)));
  }
  const capture = composeCaptureWav(inputs, scenario.followUp?.delaySeconds);
  if (readWavHeader(capture).dataBytes / 96_000 >= 120)
    throw new HarnessError(
      "Fixture is too long for the bounded 150-second scenario",
    );
  const path = join(runDir, "utterance.wav");
  await writeFile(path, capture);
  return path;
};

const runScenario = async (
  scenario: Scenario,
  utterancePath: string,
  runDir: string,
): Promise<void> => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${utterancePath}%noloop`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const watchdog = setTimeout(() => {
    void browser.close().catch(() => {});
  }, 210_000);
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
    });
    page.setDefaultTimeout(30_000);
    await page.addInitScript({
      path: fileURLToPath(new URL("./record-remote-audio.js", import.meta.url)),
    });
    const diagnostics: DiagnosticLine[] = [];
    let diagnosticCaptureFailed = false;
    page.on("console", (message) => {
      const text = message.text();
      if (!text.startsWith("[Petrinaut voice] ")) return;
      try {
        diagnostics.push(
          diagnosticSchema.parse(
            JSON.parse(text.slice("[Petrinaut voice] ".length)),
          ),
        );
      } catch {
        diagnosticCaptureFailed = true;
      }
    });
    const panel = page.getByRole("complementary", {
      name: "AI assistant",
      exact: true,
    });
    const canonical = panel.locator(
      '[data-testid="ai-transcript"] > [data-role="assistant"]',
    );
    const voices = panel.locator(
      '[data-testid="ai-transcript"] > [data-role="user"][data-voice-origin="true"]',
    );
    const fixture = page.getByRole("complementary", {
      name: "Prepared fixture status",
      exact: true,
    });
    const revision = async (): Promise<number | null> => {
      const text = await fixture.textContent({ timeout: 2_000 });
      const matched = text?.match(/Settled bundle revision (\d+);/u)?.[1];
      return matched === undefined ? null : Number(matched);
    };
    let baselineCanonical = 0;
    let baselineVoices = 0;
    let fixtureRevisionBefore: number | null = null;
    let canonicalBeforeInterruption: string[] | undefined;
    let interruptedAtMs: number | undefined;
    let notHeard = false;
    let stage = "load fixture";
    let failure: string | undefined;
    try {
      await page.goto(
        new URL("/?brunch-fixture=crew-reservation-v1", websiteUrl).href,
      );
      await page
        .getByRole("button", { name: "Skip tour", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Show AI assistant", exact: true })
        .click();
      await page.waitForFunction(() =>
        /Settled bundle revision \d+;/u.test(
          document.querySelector('[aria-label="Prepared fixture status"]')
            ?.textContent ?? "",
        ),
      );
      fixtureRevisionBefore = await revision();
      baselineCanonical = await canonical.count();
      baselineVoices = await voices.count();
      await panel
        .getByRole("button", { name: "Start voice mode", exact: true })
        .click();
      stage = "acknowledge Voice consent";
      // The visible label covers the native input; click it, then verify the role state.
      await panel
        .getByText("I understand how voice data is handled.", { exact: true })
        .click();
      if (
        !(await panel
          .getByRole("checkbox", {
            name: "I understand how voice data is handled.",
            exact: true,
          })
          .isChecked())
      ) {
        throw new HarnessError("Voice consent checkbox did not become checked");
      }
      stage = "connect before fake speech starts";
      await panel
        .getByRole("button", { name: "Start voice", exact: true })
        .click();
      const deadline = Date.now() + 150_000;
      await page.waitForFunction(
        () =>
          ["listening", "error"].includes(
            document
              .querySelector('[aria-label="AI assistant"] [data-phase]')
              ?.getAttribute("data-phase") ?? "",
          ),
        undefined,
        { timeout: 30_000 },
      );
      if (
        (await panel
          .locator("[data-phase]")
          .first()
          .getAttribute("data-phase")) === "error"
      ) {
        throw new HarnessError(
          "Voice connection failed; inspect the operational diagnostics",
        );
      }
      const connectedInTime = await page.evaluate(
        () =>
          window.__voiceE2E.microphoneRequestedAt !== undefined &&
          performance.now() - window.__voiceE2E.microphoneRequestedAt < 8_000,
      );
      if (!connectedInTime)
        throw new HarnessError(
          "Connection consumed the eight-second leading silence; input timing is invalid",
        );
      stage = "await terminal Voice state";
      let complete = false;
      let paraphraseStartedAt: number | undefined;
      while (Date.now() < deadline) {
        const state = await page.evaluate(() => ({
          phase:
            document
              .querySelector('[aria-label="AI assistant"] [data-phase]')
              ?.getAttribute("data-phase") ?? "missing",
          latency: window.__voiceE2E.latency,
          error: window.__voiceE2E.error,
          notHeard: Array.from(
            document.querySelectorAll(
              '[aria-label="AI assistant"] [data-voice-notice]',
            ),
          ).some((element) =>
            element.textContent?.includes(
              "We didn't catch that. Please try again.",
            ),
          ),
        }));
        notHeard ||= state.notHeard;
        if (state.error || state.phase === "error" || diagnosticCaptureFailed)
          throw new HarnessError("Voice or evidence capture reported an error");
        if (
          scenario.action === "take-turn-during-paraphrase" &&
          interruptedAtMs === undefined
        ) {
          const ttsStarted = state.latency.some(
            (mark) => mark.name === "first-tts-audio",
          );
          if (ttsStarted && state.phase === "speaking")
            paraphraseStartedAt ??= Date.now();
          if (
            paraphraseStartedAt !== undefined &&
            Date.now() - paraphraseStartedAt >= 3_000
          ) {
            if (state.phase !== "speaking")
              throw new HarnessError(
                "Paraphrase ended before the three-second interruption point",
              );
            canonicalBeforeInterruption = (
              await canonical.allInnerTexts()
            ).slice(baselineCanonical);
            await panel
              .getByRole("button", { name: "Your turn", exact: true })
              .click();
            interruptedAtMs = await page.evaluate(() => performance.now());
          }
        }
        const admissions = state.latency.filter(
          (mark) => mark.name === "submission-admitted",
        );
        const settled = state.latency.filter(
          (mark) => mark.name === "submission-settled",
        );
        const last = admissions.at(-1);
        const lastHasAudio =
          last !== undefined &&
          state.latency.some(
            (mark) =>
              mark.name === "first-tts-audio" &&
              mark.correlationId === last.correlationId,
          );
        const paraphraseDone = diagnostics.some(
          (line) =>
            line.operation === "speech" &&
            line.speechKind === "paraphrase" &&
            (line.outcome === "success" || line.outcome === "aborted"),
        );
        const rejection =
          scenario.allowNotHeard && notHeard && admissions.length === 0;
        const expectedTurns = scenario.followUp ? 2 : 1;
        if (
          state.phase === "listening" &&
          (rejection ||
            (admissions.length >= expectedTurns &&
              settled.length >= expectedTurns &&
              lastHasAudio &&
              paraphraseDone &&
              (scenario.action !== "take-turn-during-paraphrase" ||
                interruptedAtMs !== undefined)))
        ) {
          complete = true;
          break;
        }
        await page.waitForTimeout(100);
      }
      if (!complete)
        throw new HarnessError(
          "Timed out after 150 seconds waiting for paraphrase completion and Listening",
        );
    } catch (error: unknown) {
      failure =
        error instanceof HarnessError
          ? error.message
          : `Failed during ${stage}; inspect diagnostics and screenshot`;
    }

    let trace: Trace = {
      canonicalBubbles: [],
      commits: [],
      diagnostics,
      finalPhase: "missing",
      fixtureRevisionBefore,
      fixtureRevisionAfter: null,
      inputTranscripts: [],
      latency: [],
      notHeard,
      outputAudioSeconds: 0,
      outputAudioBytes: 0,
      canonicalBeforeInterruption,
      interruptedAtMs,
      error: failure,
    };
    let audio = Buffer.alloc(0);
    try {
      const observed = await page.evaluate(() => ({
        commits: window.__voiceE2E.commits,
        latency: window.__voiceE2E.latency,
        finalPhase:
          document
            .querySelector('[aria-label="AI assistant"] [data-phase]')
            ?.getAttribute("data-phase") ?? "missing",
      }));
      const inputTranscripts = (
        await voices.evaluateAll((elements) =>
          elements.map((element) => {
            const copy = element.cloneNode(true) as HTMLElement;
            copy
              .querySelectorAll('[data-testid="voice-input-provenance"]')
              .forEach((chip) => chip.remove());
            return copy.textContent?.trim() ?? "";
          }),
        )
      ).slice(baselineVoices);
      trace = {
        ...trace,
        ...observed,
        inputTranscripts,
        canonicalBubbles: (await canonical.allInnerTexts()).slice(
          baselineCanonical,
        ),
        fixtureRevisionAfter: await revision(),
      };
      const base64 = await page.evaluate(() =>
        Promise.race([
          window.__voiceE2E.stopRecording(),
          new Promise<string>((_resolve, reject) =>
            setTimeout(
              () => reject(new Error("recording-stop-timeout")),
              10_000,
            ),
          ),
        ]),
      );
      audio = Buffer.from(base64, "base64");
      trace = {
        ...trace,
        outputAudioBytes: audio.length,
        outputAudioSeconds: await page.evaluate(
          () => window.__voiceE2E.recordedMs / 1000,
        ),
      };
    } catch {
      trace = {
        ...trace,
        error: trace.error ?? "Could not collect complete browser evidence",
      };
    }
    try {
      await page.screenshot({
        path: join(runDir, "screenshot.png"),
        fullPage: true,
        timeout: 10_000,
      });
    } catch {
      trace = { ...trace, error: trace.error ?? "Screenshot capture failed" };
    }
    if (diagnosticCaptureFailed)
      trace = {
        ...trace,
        error: trace.error ?? "A Voice diagnostic could not be decoded safely",
      };
    const results = checkTrace(scenario, trace);
    await writeFile(join(runDir, "output.webm"), audio);
    await writeFile(
      join(runDir, "trace.json"),
      `${JSON.stringify({ scenario, trace, results, browserVersion: browser.version(), nodeVersion: process.version }, null, 2)}\n`,
    );
    for (const check of results)
      process.stdout.write(
        `${check.level.toUpperCase().padEnd(4)} ${scenario.id} ${check.name}: ${check.detail}\n`,
      );
    if (results.some((check) => check.level === "fail")) process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    await browser.close();
  }
};

const main = async (): Promise<void> => {
  const scenarios = z
    .array(scenarioSchema)
    .min(1)
    .max(6)
    .parse(
      JSON.parse(
        await readFile(new URL("./scenarios.json", import.meta.url), "utf8"),
      ),
    );
  if (process.argv[2] === "--prepare-fixtures") {
    const directory = process.argv[3];
    if (!directory || process.platform !== "darwin")
      throw new HarnessError(
        "--prepare-fixtures <directory> requires macOS say; it makes no provider calls",
      );
    await mkdir(directory, { recursive: true });
    for (const scenario of scenarios) {
      await synthesizeUtterance(
        scenario.utterance,
        join(directory, `${scenario.id}.wav`),
      );
      if (scenario.followUp)
        await synthesizeUtterance(
          scenario.followUp.utterance,
          join(directory, `${scenario.id}-follow-up.wav`),
        );
    }
    return;
  }
  if (process.argv.length > 2)
    throw new HarnessError(
      "Unknown arguments; use --prepare-fixtures <directory> or no arguments",
    );
  await preflight();
  const selected = scenarios.filter(
    (scenario) =>
      process.env.VOICE_E2E_ONLY === undefined ||
      scenario.id === process.env.VOICE_E2E_ONLY,
  );
  if (selected.length === 0)
    throw new HarnessError("VOICE_E2E_ONLY does not match a scenario");
  const stamp = new Date().toISOString();
  const sweepDir = join(
    outRoot,
    stamp.slice(0, 10),
    stamp.slice(11).replaceAll(":", "-"),
  );
  const prepared = [];
  // Validate every WAV before opening even one paid connection. Never retry automatically.
  for (const scenario of selected) {
    const runDir = join(sweepDir, scenario.id);
    await mkdir(runDir, { recursive: true });
    prepared.push({
      scenario,
      runDir,
      path: await prepareAudio(scenario, runDir),
    });
  }
  for (const run of prepared)
    await runScenario(run.scenario, run.path, run.runDir);
};

await main().catch((error: unknown) => {
  // Do not print arbitrary provider/Playwright errors: they can contain payloads.
  process.stderr.write(
    `Voice E2E stopped: ${error instanceof HarnessError ? error.message : "preflight or browser failure; verify WAV paths and local services"}\n`,
  );
  process.exitCode = 1;
});
