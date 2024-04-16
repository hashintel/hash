import puppeteer from "puppeteer";
import sanitizeHtml from "sanitize-html";

export const getWebPageInnerHtml = async (params: {
  url: string;
  sanitizeForLlm?: boolean;
}): Promise<{ innerHtml: string }> => {
  const { url, sanitizeForLlm } = params;

  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  await page.goto(url, {
    // waits until the network is idle (no more than 2 network connections for at least 500 ms)
    waitUntil: "networkidle2",
  });

  const innerHtml = await page.evaluate(
    () => document.documentElement.innerHTML,
  );

  await browser.close();

  if (sanitizeForLlm) {
    const sanitizedHtml = sanitizeHtml(innerHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.filter(
        /**
         * @todo: consider whether there are other tags that aren't relevant
         * for LLM consumption.
         */
        (tag) => !["script", "style", "link"].includes(tag),
      ),
      allowedAttributes: {
        "*": [
          "href",
          "src",
          "onclick",
          "title",
          "alt",
          "aria",
          "label",
          "aria-*",
          "data-*",
        ],
      },
      disallowedTagsMode: "discard",
    });

    return { innerHtml: sanitizedHtml };
  }

  return { innerHtml };
};
