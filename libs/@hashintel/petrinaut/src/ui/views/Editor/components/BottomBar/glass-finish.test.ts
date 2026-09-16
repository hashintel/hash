import { describe, expect, it } from "vitest";

import { detectGlassFinish } from "./glass-finish";

const chromeUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const safariUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const firefoxUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0";
const chromeOnIosUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1";

describe("detectGlassFinish", () => {
  it("refracts on a Chromium brand whatever the shell", () => {
    expect(
      detectGlassFinish({
        userAgent: chromeUserAgent,
        userAgentData: {
          brands: [
            { brand: "Not/A)Brand" },
            { brand: "Microsoft Edge" },
            { brand: "Chromium" },
          ],
        },
      }),
    ).toBe("refractive");
  });

  it("blurs when the brands name no Chromium", () => {
    expect(
      detectGlassFinish({
        userAgent: chromeUserAgent,
        userAgentData: { brands: [{ brand: "Not/A)Brand" }] },
      }),
    ).toBe("blur");
  });

  it("falls back to the user agent string where client hints are absent", () => {
    expect(detectGlassFinish({ userAgent: chromeUserAgent })).toBe(
      "refractive",
    );
    expect(detectGlassFinish({ userAgent: safariUserAgent })).toBe("blur");
    expect(detectGlassFinish({ userAgent: firefoxUserAgent })).toBe("blur");
  });

  it("blurs for Chrome on iOS, which renders with WebKit", () => {
    expect(detectGlassFinish({ userAgent: chromeOnIosUserAgent })).toBe("blur");
  });
});
