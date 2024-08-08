import { mkdirSync, writeFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getWebPageActivity } from "../src/activities/get-web-page-activity.js";

/**
 * @file a script which fetches a web page and sanitizes its HTML content for LLM consumption,
 *    in the same way as is done when passing HTML to LLMs in flows, saving the sanitized HTML to a file.
 *
 *    A convenience to more easily generate test data for testing / optimizing.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const url = process.argv[2];

if (!url) {
  console.error(
    "No URL provided – usage: `yarn sanitize https://example.com'`",
  );
  process.exit(1);
}

let hostname: string;
let filename: string;
try {
  const urlObject = new URL(url);
  hostname = urlObject.hostname;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
  filename = `${urlObject.pathname.split("/").pop() || "index"}.html`;
} catch {
  console.error(`Invalid URL '${url}' provided`);
  process.exit(1);
}

const response = await getWebPageActivity({ url, sanitizeForLlm: true });

if ("error" in response) {
  console.error(`Error fetching ${url}: ${response.error}`);
  process.exit(1);
}

const folder = path.join(__dirname, `sanitized-html/${hostname}`);

mkdirSync(folder, { recursive: true });

const filePath = `${folder}/${filename}`;

writeFileSync(filePath, response.htmlContent);

console.log(`Sanitized HTML saved to ${filePath}`);
