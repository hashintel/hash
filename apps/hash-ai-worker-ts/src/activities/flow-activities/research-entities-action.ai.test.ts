import "../../shared/testing-utilities/mock-get-flow-context.js";

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

import { researchEntitiesAction } from "./research-entities-action.js";
import type { CoordinatingAgentState } from "./research-entities-action/shared/coordinators.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseDirectoryPath = join(__dirname, "/var/persisted-state");

export const retrievePreviousState = (params: {
  testName: string;
}): CoordinatingAgentState | undefined => {
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

  return JSON.parse(latestFileContent) as CoordinatingAgentState;
};

const persistState = (params: {
  state: CoordinatingAgentState;
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

test.skip(
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
            value: ["https://hash.ai/@hash/types/entity-type/company/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
        persistState: (state) =>
          persistState({ state, testName: "google-subsidiaries" }),
        resumeFromState: retrievePreviousState({
          testName: "google-subsidiaries",
        }),
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
            value: ["https://hash.ai/@hash/types/entity-type/person/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
        persistState: (state) =>
          persistState({ state, testName: "sora-authors" }),
        resumeFromState: retrievePreviousState({
          testName: "sora-authors",
        }),
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  'Test researchEntitiesAction: find information about a person called "Ben Werner", a software engineer based in London',
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value:
              'Find information about a person called "Ben Werner", a software engineer based in London',
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: ["https://hash.ai/@hash/types/entity-type/person/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
        persistState: (state) =>
          persistState({ state, testName: "ben-werner" }),
        // resumeFromState: retrievePreviousState({ testName: "ben-werner" }),
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  'Test researchEntitiesAction: Find information about a person called "Tim Brooks", an employee at OpenAI',
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value:
              'Find information about a person called "Tim Brooks", an employee at OpenAI',
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: ["https://hash.ai/@hash/types/entity-type/person/v/1"],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
        persistState: (state) =>
          persistState({ state, testName: "tim-brooks" }),
        resumeFromState: retrievePreviousState({ testName: "tim-brooks" }),
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  "Test researchEntitiesAction: Find all the Large Language Models provided by OpenAI",
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value: "Find all the Large Language Models provided by OpenAI",
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: [
              "https://hash.ai/@hash/types/entity-type/large-language-model/v/1",
            ],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
        persistState: (state) =>
          persistState({ state, testName: "openai-llm" }),
        resumeFromState: retrievePreviousState({ testName: "openai-llm" }),
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  "Test researchEntitiesAction: Find a comparison of graphics cards which can be used for running AI models",
  async () => {
    const status = await researchEntitiesAction({
      inputs: [
        {
          inputName: "prompt",
          payload: {
            kind: "Text",
            value:
              "Find a comparison of graphics cards which can be used for running AI models",
          },
        },
        {
          inputName: "entityTypeIds",
          payload: {
            kind: "VersionedUrl",
            value: [
              "https://hash.ai/@hash/types/entity-type/graphics-card/v/1",
            ],
          },
        },
      ],
      testingParams: {
        humanInputCanBeRequested: false,
        persistState: (state) =>
          persistState({ state, testName: "graphics-cards" }),
        resumeFromState: retrievePreviousState({ testName: "graphics-cards" }),
      },
    });

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);
