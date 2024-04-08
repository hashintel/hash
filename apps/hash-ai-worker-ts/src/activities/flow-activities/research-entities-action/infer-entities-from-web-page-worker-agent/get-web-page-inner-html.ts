import puppeteer from "puppeteer";

export const getWebPageInnerHtml = async (params: {
  url: string;
}): Promise<{ innerHtml: string }> => {
  const { url } = params;

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

  return { innerHtml };
};
