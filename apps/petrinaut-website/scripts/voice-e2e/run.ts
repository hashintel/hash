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

import type { Scenario } from "./trace-checks.ts";

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
    throw new Error(
      "Voice E2E is paid, on-demand tooling and must never run in CI",
    );
  if (process.env.VOICE_E2E_APPROVED !== "true")
    throw new Error(
      "Paid run: set VOICE_E2E_APPROVED=true only with owner approval; $5 aggregate cap",
    );
  const url = new URL(websiteUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Use a local website with disposable local Brunch data");
  const config = await fetch(new URL("/api/voice/config", websiteUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  if (config.status !== 200)
    throw new Error(
      `Voice config unavailable (HTTP ${config.status}); start the website with Voice enabled`,
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
        throw new Error(
          "macOS say is unavailable. Supply macOS-generated WAVs with VOICE_E2E_INPUT_DIR (see --prepare-fixtures)",
        );
      await synthesizeUtterance(utterance.text, path);
    }
    inputs.push(new Uint8Array(await readFile(path)));
  }
  const capture = composeCaptureWav(inputs, scenario.followUp?.delaySeconds);
  if (readWavHeader(capture).dataBytes / 96_000 >= 120)
    throw new Error("Fixture is too long for the bounded 150-second scenario");
  const path = join(runDir, "utterance.wav");
  await writeFile(path, capture);
  return path;
};

const runScenario = async (
  scenario: Scenario,
  utterancePath: string,
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
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
    });
    page.setDefaultTimeout(30_000);
    await page.goto(
      new URL("/?brunch-fixture=crew-reservation-v1", websiteUrl).href,
    );
    const panel = page.getByRole("complementary", {
      name: "AI assistant",
      exact: true,
    });
    await panel
      .getByRole("checkbox", {
        name: "I understand how voice data is handled.",
        exact: true,
      })
      .check();
    await panel
      .getByRole("button", { name: "Start voice", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="AI assistant"] [data-phase]')
          ?.getAttribute("data-phase") === "listening",
      undefined,
      { timeout: 30_000 },
    );
    process.stdout.write(`${scenario.id}: reached listening\n`);
  } finally {
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
      throw new Error(
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
    throw new Error(
      "Unknown arguments; use --prepare-fixtures <directory> or no arguments",
    );
  await preflight();
  const selected = scenarios.filter(
    (scenario) =>
      process.env.VOICE_E2E_ONLY === undefined ||
      scenario.id === process.env.VOICE_E2E_ONLY,
  );
  if (selected.length === 0)
    throw new Error("VOICE_E2E_ONLY does not match a scenario");
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
  for (const run of prepared) await runScenario(run.scenario, run.path);
};

await main().catch((error: unknown) => {
  // Do not print arbitrary provider/Playwright errors: they can contain payloads.
  process.stderr.write(
    `Voice E2E stopped: ${error instanceof Error && error.name === "Error" ? error.message : "preflight or browser failure"}\n`,
  );
  process.exitCode = 1;
});
