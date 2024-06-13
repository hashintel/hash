import "../../../../shared/testing-utilities/mock-get-flow-context";

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

import { getDereferencedEntityTypesActivity } from "../../../get-dereferenced-entity-types-activity";
import { getFlowContext } from "../../../shared/get-flow-context";
import { graphApiClient } from "../../../shared/graph-api-client";
import { inferFactsFromWebPageWorkerAgent } from "../infer-facts-from-web-page-worker-agent";
import type { InferFactsFromWebPageWorkerAgentState } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseDirectoryPath = join(__dirname, "/var/persisted-state");

const retrievePreviousState = (params: {
  testName: string;
}): InferFactsFromWebPageWorkerAgentState | undefined => {
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

  return JSON.parse(latestFileContent) as InferFactsFromWebPageWorkerAgentState;
};

const persistState = (params: {
  state: InferFactsFromWebPageWorkerAgentState;
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
  "Test inferFactsFromWebPageWorkerAgent for Church Lab members",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await inferFactsFromWebPageWorkerAgent({
      prompt: "Obtain the full list of current members of Church Lab",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      url: "https://churchlab.hms.harvard.edu/index.php/lab-members#current",
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test inferFactsFromWebPageWorkerAgent for Sora article authors",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: ["https://hash.ai/@ftse/types/entity-type/person/v/1"],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await inferFactsFromWebPageWorkerAgent({
      prompt:
        'Obtain the full list of authors of the Sora article titled "Video Generation Models as World Simulators"',
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      url: "https://openai.com/index/video-generation-models-as-world-simulators/",
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test inferFactsFromWebPageWorkerAgent: top 3 graphics cards",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/graphics-card/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await inferFactsFromWebPageWorkerAgent({
      prompt:
        "Identify the top 3 graphics cards suitable for AI model processing, including their specifications and features.",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      url: "https://www.gpu-mart.com/blog/best-gpus-for-deep-learning-2023",
      testingParams: {
        persistState: (state) =>
          persistState({ state, testName: "top-3-graphics-cards" }),
        resumeFromState: retrievePreviousState({
          testName: "top-3-graphics-cards",
        }),
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 10 * 60 * 1000,
  },
);

test.skip(
  "Test inferFactsFromWebPageWorkerAgent for getting investors of M & S",
  async () => {
    const { userAuthentication } = await getFlowContext();

    const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
      entityTypeIds: [
        "https://hash.ai/@ftse/types/entity-type/investment-fund/v/1",
      ],
      actorId: userAuthentication.actorId,
      graphApiClient,
      simplifyPropertyKeys: true,
    });

    const status = await inferFactsFromWebPageWorkerAgent({
      prompt:
        "Get the list of investors of Marks and Spencer's, based on the 2023 annual investors report PDF file.",
      entityTypes: Object.values(dereferencedEntityTypes).map(
        ({ schema }) => schema,
      ),
      url: "https://corporate.marksandspencer.com/investors",
      testingParams: {
        persistState: (state) =>
          persistState({ state, testName: "investors-of-m-and-s" }),
        // resumeFromState: retrievePreviousState({
        //   testName: "investors-of-m-and-s",
        // }),
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status }, null, 2));

    expect(status).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
