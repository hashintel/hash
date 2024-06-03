import "../../../shared/testing-utilities/mock-get-flow-context";

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import type { SubTaskAgentState } from "./sub-task-agent";
import { runSubTaskAgent } from "./sub-task-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseDirectoryPath = join(__dirname, "/var/persisted-state");

export const retrievePreviousState = (params: {
  testName: string;
}): SubTaskAgentState | undefined => {
  const { testName } = params;

  const directoryPath = `${baseDirectoryPath}/${testName}`;

  if (!existsSync(directoryPath)) {
    return undefined;
  }

  const files = readdirSync(directoryPath);
  if (files.length === 0) {
    return undefined;
  }

  const latestFile = files[files.length - 1];

  const latestFilePath = `${directoryPath}/${latestFile}`;
  const latestFileContent = readFileSync(latestFilePath, "utf8");

  return JSON.parse(latestFileContent) as SubTaskAgentState;
};

const persistState = (params: {
  state: SubTaskAgentState;
  testName: string;
}) => {
  const { state, testName } = params;

  const directoryPath = `${baseDirectoryPath}/${testName}`;

  const filePath = `${directoryPath}/${new Date().getTime()}-state.json`;

  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(state, null, 2));
};

test(
  "Test runSubTaskAgent: Find Ben Werner's Github profile URL",
  async () => {
    const status = await runSubTaskAgent({
      goal: "Find Ben Werner's Github profile URL",
      relevantEntities: [],
      existingFactsAboutRelevantEntities: [],
      testingParams: {
        persistState: (state) =>
          persistState({ state, testName: "github-url" }),
        resumeFromState: retrievePreviousState({
          testName: "github-url",
        }),
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);
