import "../../../shared/testing-utilities/mock-get-flow-context.js";

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

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { runSubCoordinatingAgent } from "./sub-coordinating-agent.js";
import type { SubCoordinatingAgentState } from "./sub-coordinating-agent/state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseDirectoryPath = join(
  __dirname,
  "/var/sub-task-agent/persisted-state",
);

export const retrievePreviousState = (params: {
  testName: string;
}): SubCoordinatingAgentState | undefined => {
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

  return JSON.parse(latestFileContent) as SubCoordinatingAgentState;
};

const persistState = (params: {
  state: SubCoordinatingAgentState;
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
  "Test runSubCoordinatorAgent: Find Ben Werner's Github profile URL",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@hash/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const entityTypes = Object.values(dereferencedEntityTypes).map(
      ({ schema }) => schema,
    );

    const status = await runSubCoordinatingAgent({
      input: {
        goal: "Find Ben Werner's Github profile URL",
        relevantEntities: [],
        existingClaimsAboutRelevantEntities: [],
        entityTypes,
      },
      testingParams: {
        persistState: (state) =>
          persistState({ state, testName: "github-url" }),
        resumeFromState: retrievePreviousState({
          testName: "github-url",
        }),
      },
      workerIdentifiers: {
        workerType: "Sub-coordinator",
        workerInstanceId: "subcoordinator1",
        parentInstanceId: null,
        toolCallId: null,
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);
