/* eslint-disable import/no-extraneous-dependencies */
import { mkdirSync, writeFileSync } from "node:fs";

import { JSDOM } from "jsdom";
import sanitizeHtml from "sanitize-html";

/**
 * Script to capture and sanitize HTML from web pages for test fixtures.
 *
 * Usage: npx tsx scripts/capture-test-fixtures.ts
 *
 * This script fetches web pages and sanitizes them for LLM consumption,
 * then outputs the results to fixture files that can be used in tests.
 */

// Target URLs to capture
const targets = [
  {
    name: "sora-paper",
    url: "https://arxiv.org/html/2402.17177v1",
    title:
      "Sora: A Review on Background, Technology, Limitations, and Opportunities of Large Vision Models",
  },
  {
    name: "ftse350",
    url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
    title: "FTSE 350 Constituents",
  },
  {
    name: "openai-models",
    url: "https://platform.openai.com/docs/models",
    title: "OpenAI Models Documentation",
  },
];

/**
 * Sanitize HTML for LLM consumption.
 * Adapted from hash-ai-worker-ts/src/activities/get-web-page-activity.ts
 */
const allowedAttributes = [
  "href",
  "src",
  "onclick",
  "title",
  "alt",
  "aria",
  "label",
  "aria-*",
  "data-*",
];

const disallowedTags = ["script", "style", "link", "canvas", "svg"];

const disallowedTagsWithNoRelevantAttributes = [
  "div",
  "span",
  "strong",
  "b",
  "i",
  "em",
];

function sanitizeHtmlForLlmConsumption(params: {
  htmlContent: string;
  maximumNumberOfTokens?: number;
}): string {
  const { htmlContent, maximumNumberOfTokens = 75_000 } = params;

  const sanitized = sanitizeHtml(htmlContent, {
    allowedTags: sanitizeHtml.defaults.allowedTags.filter(
      (tag) => !disallowedTags.includes(tag),
    ),
    allowedAttributes: { "*": allowedAttributes },
    disallowedTagsMode: "discard",
  });

  const dom = new JSDOM(sanitized);
  const document = dom.window.document;

  const elements = document.querySelectorAll(
    disallowedTagsWithNoRelevantAttributes.join(","),
  );

  for (const element of elements) {
    if (!element.attributes.length) {
      while (element.firstChild) {
        element.parentNode?.insertBefore(element.firstChild, element);
      }
      element.remove();
    }
  }

  let result = document.body.innerHTML.replace(/>\s+</g, "><").trim();

  // Cut repeated newlines and tabs
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\t{3,}$/g, "\t\t");

  // Slice to token limit (assume 4 chars per token)
  return result.slice(0, maximumNumberOfTokens * 4);
}

async function fetchAndSanitize(url: string): Promise<string> {
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  console.log(`  Raw HTML length: ${html.length}`);

  const sanitized = sanitizeHtmlForLlmConsumption({ htmlContent: html });
  console.log(`  Sanitized length: ${sanitized.length}`);

  return html;
  return sanitized;
}

async function main() {
  const outputDir = "src/mastra/fixtures/raw";

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  for (const target of targets) {
    try {
      const sanitizedHtml = await fetchAndSanitize(target.url);

      const outputPath = `${outputDir}/${target.name}.html`;
      writeFileSync(outputPath, sanitizedHtml);
      console.log(`  Saved to: ${outputPath}`);
    } catch (error) {
      console.error(`Failed to capture ${target.name}:`, error);
    }
  }

  console.log(
    "\nDone! Now update infer-claims-fixtures.ts to import these files.",
  );
}

main().catch(console.error);
