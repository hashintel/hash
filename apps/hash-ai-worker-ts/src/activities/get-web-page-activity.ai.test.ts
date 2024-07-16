import "../shared/testing-utilities/mock-get-flow-context.js";

import { expect, test } from "vitest";

import {
  getWebPageActivity,
  sanitizeHtmlForLlmConsumption,
} from "./get-web-page-activity.js";

test.skip(
  "Test getWebPageActivity with a Wikipedia page",
  async () => {
    const webPage = await getWebPageActivity({
      url: "https://en.wikipedia.org/wiki/Tesla,_Inc.",
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ htmlContent }, null, 2));

    expect(htmlContent).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip(
  "Test getWebPageActivity with a FTSE 350 page",
  async () => {
    const webPage = await getWebPageActivity({
      url: "https://www.londonstockexchange.com/indices/ftse-350/constituents/table",
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      throw new Error(webPage.error);
    }

    const { htmlContent } = webPage;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ htmlContent }, null, 2));

    expect(htmlContent).toBeDefined();
  },
  {
    timeout: 5 * 60 * 1000,
  },
);

test.skip("Test sanitizeHtmlForLlmConsumption with custom HTML", () => {
  const sanitizedHtml = sanitizeHtmlForLlmConsumption({
    htmlContent: `
      <body>
        <div>
          <div data-important="important info">
            <h1>Heading</h1>
            <p>Paragraph</p>
          </div>
        </div>
      </body>
      `,
  });

  expect(sanitizedHtml).toBe(
    `<div data-important="important info"><h1>Heading</h1><p>Paragraph</p></div>`,
  );
});
