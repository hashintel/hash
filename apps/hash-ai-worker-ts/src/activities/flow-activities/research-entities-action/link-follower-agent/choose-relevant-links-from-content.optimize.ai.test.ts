import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Url } from "@blockprotocol/type-system";
import dedent from "dedent";
import { test } from "vitest";

import { getWebPageActivity } from "../../../get-web-page-activity.js";
import type { LlmParams } from "../../../shared/get-llm-response/types.js";
import { optimizeSystemPrompt } from "../../../shared/optimize-system-prompt.js";
import type { MetricDefinition } from "../../../shared/optimize-system-prompt/types.js";
import {
  chooseRelevantLinksFromContent,
  chooseRelevantLinksFromContentSystemPrompt,
} from "./choose-relevant-links-from-content.js";

const ftse350MetricPrompt = "Find all the FTSE350 stock market constituents.";

const ftse350WebPage = await getWebPageActivity({
  url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table" as Url,
  sanitizeForLlm: true,
});

if ("error" in ftse350WebPage) {
  throw new Error(ftse350WebPage.error);
}

const ftse350Metric: MetricDefinition = {
  name: "Get all FTSE350 paginated links",
  description: dedent(`
    The user prompt provided to the LLM is: "${ftse350MetricPrompt}".
    The text provided to the LLM is the HTML of a web-page containing a table of
      FTSE350 constituents, paginated across multiple pages.

    The LLM must extract all the paginated links from the FTSE350 constituents page, because
      the links must be followed to extract the full list of FTSE350 constituents.

    The score in this metric is calculated as the number of extracted links that match the expected links.
  `),
  executeMetric: async (params) => {
    const { testingParams } = params;

    const response = await chooseRelevantLinksFromContent({
      contentUrl: ftse350WebPage.url,
      content: ftse350WebPage.htmlContent,
      contentType: "html",
      goal: ftse350MetricPrompt,
      testingParams,
    });

    if (response.status !== "ok") {
      return {
        score: 0,
        naturalLanguageReport: `The LLM encountered an error: ${JSON.stringify(
          response,
          null,
          2,
        )}.`,
        encounteredError: response,
        testingParams,
      };
    }

    const expectedLinks = [
      "https://www.londonstockexchange.com/indices/ftse-350/constituents/table?page=2",
      "https://www.londonstockexchange.com/indices/ftse-350/constituents/table?page=3",
      "https://www.londonstockexchange.com/indices/ftse-350/constituents/table?page=4",
      "https://www.londonstockexchange.com/indices/ftse-350/constituents/table?page=5",
      "https://www.londonstockexchange.com/indices/ftse-350/constituents/table?page=6",
      "https://www.londonstockexchange.com/indices/ftse-350/constituents/table?page=18",
    ];

    const correctLinks = expectedLinks.reduce(
      (acc, expectedLink) =>
        acc + (response.links.some(({ url }) => url === expectedLink) ? 1 : 0),
      0,
    );

    const score = correctLinks / expectedLinks.length;

    const missedUrls = expectedLinks.filter(
      (expectedLink) => !response.links.some(({ url }) => url === expectedLink),
    );

    return {
      score,
      testingParams,
      naturalLanguageReport:
        missedUrls.length > 0
          ? `The LLM failed to extract the following paginated links from the FTSE350 constituents page: ${JSON.stringify(
              missedUrls,
            )}`
          : "The LLM successfully extracted all the paginated links from the FTSE350 constituents page.",
      additionalInfo: {
        missedUrls,
      },
    };
  },
};

const marksAndSpencersInvestorsPage = await getWebPageActivity({
  url: "https://corporate.marksandspencer.com/investors" as Url,
  sanitizeForLlm: true,
});

if ("error" in marksAndSpencersInvestorsPage) {
  throw new Error(marksAndSpencersInvestorsPage.error);
}

const marksAndSpencerInvestorsPrompt =
  "Find the investors of Marks and Spencers in its latest annual company report.";

const marksAndSpencersAnnualInvestorsReport: MetricDefinition = {
  name: "Get the link to the Marks and Spencers annual investors report PDF",
  description: dedent(`
    The user prompt provided to the LLM is: "${marksAndSpencerInvestorsPrompt}".
    The text provided to the LLM is the HTML of the Marks and Spencers investors page, which
      includes links to a variety of documents, including the annual investor report published
      by the company every year.

    To satisfy the prompt, the LLM must extract the link to the latest annual investor report PDF
      published by Marks and Spencers, which is https://corporate.marksandspencer.com/sites/marksandspencer/files/2024-06/M-and-S-2024-Annual-Report.pdf.

    The score in this metric is calculated as 1 if the correct link is extracted, and 0 otherwise.
  `),
  executeMetric: async (params) => {
    const { testingParams } = params;

    const response = await chooseRelevantLinksFromContent({
      contentUrl: marksAndSpencersInvestorsPage.url,
      content: marksAndSpencersInvestorsPage.htmlContent,
      contentType: "html",
      goal: marksAndSpencerInvestorsPrompt,
      testingParams,
    });

    if (response.status !== "ok") {
      return {
        score: 0,
        naturalLanguageReport: `The LLM encountered an error: ${JSON.stringify(
          response,
          null,
          2,
        )}.`,
        encounteredError: response,
        testingParams,
      };
    }

    const expectedLinks = [
      "https://corporate.marksandspencer.com/sites/marksandspencer/files/2024-06/M-and-S-2024-Annual-Report.pdf",
    ];

    const correctLinks = expectedLinks.reduce(
      (acc, expectedLink) =>
        acc + (response.links.some(({ url }) => url === expectedLink) ? 1 : 0),
      0,
    );

    const score = correctLinks / expectedLinks.length;

    const missedUrls = expectedLinks.filter(
      (expectedLink) => !response.links.some(({ url }) => url === expectedLink),
    );

    return {
      score,
      testingParams,
      naturalLanguageReport:
        missedUrls.length > 0
          ? `The LLM failed to extract the following links from the page: ${JSON.stringify(
              missedUrls,
            )}`
          : "The LLM successfully extracted all the required links from the page.",
      additionalInfo: {
        missedUrls,
      },
    };
  },
};

const gpuSpecsPage = await getWebPageActivity({
  url: "https://www.techpowerup.com/gpu-specs/" as Url,
  sanitizeForLlm: true,
});

if ("error" in gpuSpecsPage) {
  throw new Error(gpuSpecsPage.error);
}

const graphicsCardSpecificationPrompt =
  "Find the technical specifications of the NVIDIA GeForce RTX 4090 graphics card";

const graphicsCardSpecificationMetric: MetricDefinition = {
  name: "Get the specifications page of a graphics card",
  description: dedent(`
    The user prompt provided to the LLM is: "${graphicsCardSpecificationPrompt}".
    The text provided to the LLM is the HTML of a web-page containing a table of
      graphics cards and links to specification pages.

    To satisfy the prompt, the LLM must extract the link to the specification page of
      the NVIDIA GeForce RTX 4090 graphics card, which is https://www.techpowerup.com/gpu-specs/geforce-rtx-4090.c3889.

    The score in this metric is calculated as 1 if the correct link is extracted, and 0 otherwise.
  `),
  executeMetric: async (params) => {
    const { testingParams } = params;

    const response = await chooseRelevantLinksFromContent({
      contentUrl: gpuSpecsPage.url,
      content: gpuSpecsPage.htmlContent,
      contentType: "html",
      goal: graphicsCardSpecificationPrompt,
      testingParams,
    });

    if (response.status !== "ok") {
      return {
        score: 0,
        naturalLanguageReport: `The LLM encountered an error: ${JSON.stringify(
          response,
          null,
          2,
        )}.`,
        encounteredError: response,
        testingParams,
      };
    }

    const expectedLinks = [
      "https://www.techpowerup.com/gpu-specs/geforce-rtx-4090.c3889",
    ];

    const correctLinks = expectedLinks.reduce(
      (acc, expectedLink) =>
        acc + (response.links.some(({ url }) => url === expectedLink) ? 1 : 0),
      0,
    );

    const score = correctLinks / expectedLinks.length;

    const missedUrls = expectedLinks.filter(
      (expectedLink) => !response.links.some(({ url }) => url === expectedLink),
    );

    return {
      score,
      testingParams,
      naturalLanguageReport:
        missedUrls.length > 0
          ? `The LLM failed to extract the following links from the page: ${JSON.stringify(
              missedUrls,
            )}`
          : "The LLM successfully extracted all the required links from the page.",
      additionalInfo: {
        missedUrls,
      },
    };
  },
};

const metrics: MetricDefinition[] = [
  ftse350Metric,
  marksAndSpencersAnnualInvestorsReport,
  graphicsCardSpecificationMetric,
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDirectoryPath = path.join(
  __dirname,
  "/var/extract-links-from-text-testing",
);

test(
  "Extract links form text system prompt test",
  async () => {
    const models: LlmParams["model"][] = ["claude-haiku-4-5-20251001"];

    await optimizeSystemPrompt({
      models,
      initialSystemPrompt: chooseRelevantLinksFromContentSystemPrompt,
      directoryPath: baseDirectoryPath,
      metrics,
      attemptsPerPrompt: 3,
      promptIterations: 4,
    });
  },
  {
    timeout: 30 * 60 * 1000,
  },
);
