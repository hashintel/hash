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

import { researchEntitiesAction } from "../research-entities-action";
import type { CoordinatingAgentState } from "./coordinating-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const directoryPath = join(__dirname, "/var/persisted-state");

export const retrievePreviousState = (): CoordinatingAgentState => {
  if (!existsSync(directoryPath)) {
    throw new Error("No persisted state directory found.");
  }

  const files = readdirSync(directoryPath);
  if (files.length === 0) {
    throw new Error("No state files found in the directory.");
  }

  const latestFile = files[files.length - 1];

  const latestFilePath = `${directoryPath}/${latestFile}`;
  const latestFileContent = readFileSync(latestFilePath, "utf8");

  return JSON.parse(latestFileContent) as CoordinatingAgentState;
};

const persistState = (params: { state: CoordinatingAgentState }) => {
  const { state } = params;

  const filePath = `${directoryPath}/${new Date().getTime()}-state.json`;

  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(state, null, 2));
};

test(
  "Test researchEntitiesAction: find subsidiary companies of Google",
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value: "Find 3 subsidiary companies of Google",
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: ["https://hash.ai/@ftse/types/entity-type/company/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
        persistState: (state) => persistState({ state }),
        resumeFromState: retrievePreviousState(),
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  "Test researchEntitiesAction: find the authors of the 'Video generation models as world simulators' article",
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value:
              'Obtain the authors of the "Video generation models as world simulators" article',
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
