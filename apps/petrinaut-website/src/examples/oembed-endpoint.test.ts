import { describe, expect, it } from "vitest";

// The endpoint lives in `api/`, where every module is deployed as a Vercel
// function, so its test lives here instead. It is imported through the default
// export, the only one the module has: a named `fetch` export alongside it
// stops Vercel's runtime from invoking the function.
import oembedEndpoint from "../../api/oembed";

const { fetch } = oembedEndpoint;

const endpointRequest = (
  sourceUrl?: string,
  options: {
    format?: string;
    maxheight?: string;
    maxwidth?: string;
    method?: string;
  } = {},
): Request => {
  const endpoint = new URL("https://demo.petrinaut.org/api/oembed");
  if (sourceUrl !== undefined) {
    endpoint.searchParams.set("url", sourceUrl);
  }
  for (const name of ["format", "maxheight", "maxwidth"] as const) {
    const value = options[name];
    if (value !== undefined) {
      endpoint.searchParams.set(name, value);
    }
  }
  return new Request(endpoint, { method: options.method ?? "GET" });
};

const responseJson = async (
  response: Response,
): Promise<Record<string, unknown>> =>
  response.json() as Promise<Record<string, unknown>>;

describe("Petrinaut oEmbed endpoint", () => {
  it("returns a JSON oEmbed response for an unversioned canonical URL", async () => {
    const response = await fetch(
      endpointRequest("https://demo.petrinaut.org/examples/gases-1-pn"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(await responseJson(response)).toEqual({
      type: "rich",
      version: "1.0",
      title: "Gases 1 — One Customer",
      provider_name: "Petrinaut",
      provider_url: "https://demo.petrinaut.org",
      width: 800,
      height: 450,
      html: '<iframe src="https://demo.petrinaut.org/embed/examples/gases-1-pn" title="Gases 1 — One Customer" width="800" height="450" style="border:0" loading="lazy" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" allowfullscreen></iframe>',
    });
  });

  it("preserves only valid embed state from the source URL", async () => {
    const source = new URL("https://demo.petrinaut.org/examples/gases-2-spn");
    source.searchParams.set("mode", "simulate");
    // Neither of these is a contract key, so both drop: the Simulate section
    // is carried as `view`, and `section` is somebody else's spelling.
    source.searchParams.set("section", "metrics");
    source.searchParams.set("scenario", "scenario-1");
    source.searchParams.set("subnet", "subnet-1");
    source.searchParams.set("itemType", "transition");
    source.searchParams.set("itemId", "transition-1");
    source.searchParams.set("unrelated", "discard-me");

    const response = await fetch(
      endpointRequest(source.href, { format: "json" }),
    );
    const body = await responseJson(response);

    expect(response.status).toBe(200);
    expect(body.html).toBe(
      '<iframe src="https://demo.petrinaut.org/embed/examples/gases-2-spn?itemId=transition-1&amp;itemType=transition&amp;mode=simulate&amp;scenario=scenario-1&amp;subnet=subnet-1" title="Gases 2 — Shared Tanker" width="800" height="450" style="border:0" loading="lazy" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" allowfullscreen></iframe>',
    );
  });

  it("drops an incomplete focused-item pair", async () => {
    const response = await fetch(
      endpointRequest(
        "https://demo.petrinaut.org/examples/gases-1-pn?itemType=script&itemId=place-1",
      ),
    );
    const body = await responseJson(response);

    expect(body.html).not.toContain("itemId");
    expect(body.html).not.toContain("itemType");
  });

  it("drops full-page no-scenario state from embeds", async () => {
    const response = await fetch(
      endpointRequest(
        "https://demo.petrinaut.org/examples/gases-1-pn?scenario=none",
      ),
    );
    const body = await responseJson(response);

    expect(body.html).not.toContain("scenario=");
  });

  it("URL-encodes query values and HTML-escapes the iframe source", async () => {
    const source = new URL(
      "https://demo.petrinaut.org/examples/semiconductor-fab-drift",
    );
    source.searchParams.set("scenario", '"><script>alert("x")</script>&');
    source.searchParams.set("subnet", "one&two");

    const response = await fetch(endpointRequest(source.href));
    const body = await responseJson(response);
    const html = body.html as string;

    expect(html).not.toContain("<script>");
    expect(html).toContain(
      "scenario=%22%3E%3Cscript%3Ealert%28%22x%22%29%3C%2Fscript%3E%26",
    );
    expect(html).toContain("&amp;subnet=one%26two");
  });

  it.each([
    [{ maxwidth: "400" }, 400, 225],
    [{ maxheight: "225" }, 400, 225],
    [{ maxwidth: "320", maxheight: "100" }, 177, 100],
    [{ maxwidth: "1600", maxheight: "900" }, 800, 450],
  ] as const)(
    "fits a 16:9 embed inside %j without upscaling",
    async (limits, expectedWidth, expectedHeight) => {
      const response = await fetch(
        endpointRequest(
          "https://demo.petrinaut.org/examples/truck-fleet-predictive-maintenance",
          limits,
        ),
      );
      const body = await responseJson(response);

      expect(body.width).toBe(expectedWidth);
      expect(body.height).toBe(expectedHeight);
      expect(body.html).toContain(`width="${expectedWidth}"`);
      expect(body.html).toContain(`height="${expectedHeight}"`);
    },
  );

  it.each([
    ["maxwidth", "0"],
    ["maxwidth", "-1"],
    ["maxwidth", "Infinity"],
    ["maxwidth", "0x10"],
    ["maxwidth", "1e3"],
    ["maxwidth", "1.5"],
    ["maxheight", "not-a-number"],
  ] as const)("rejects invalid %s=%j", async (name, value) => {
    const response = await fetch(
      endpointRequest("https://demo.petrinaut.org/examples/gases-1-pn", {
        [name]: value,
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: `${name} must be a positive integer`,
    });
  });

  it.each(["maxwidth", "maxheight"] as const)(
    "treats a blank %s as no maximum",
    async (name) => {
      // Consumers that always append the optional params send them empty when
      // the user set no size.
      const response = await fetch(
        endpointRequest("https://demo.petrinaut.org/examples/gases-1-pn", {
          [name]: "",
        }),
      );

      expect(response.status).toBe(200);
      expect(await responseJson(response)).toMatchObject({
        width: 800,
        height: 450,
      });
    },
  );

  it("keeps the aspect ratio when clamping to a maximum", async () => {
    const response = await fetch(
      endpointRequest("https://demo.petrinaut.org/examples/gases-1-pn", {
        maxwidth: "400",
      }),
    );

    const body = (await responseJson(response)) as {
      width: number;
      height: number;
    };
    expect(body.width).toBe(400);
    expect(body.width / body.height).toBeCloseTo(800 / 450, 2);
  });

  // 400 is for a request this endpoint cannot read; a well-formed URL it
  // simply cannot embed is 404, which is the status oEmbed 1.0 section 2.3.1
  // defines and the one consumers fall back on.
  it.each([
    [undefined, 400, "Missing required url parameter"],
    ["not-a-url", 400, "The url parameter must be a valid URL"],
    [
      "https://example.com/examples/gases-1-pn",
      404,
      "The url parameter must use https://demo.petrinaut.org",
    ],
    [
      "https://demo.petrinaut.org/embed/examples/gases-1-pn",
      404,
      "The url parameter is not a canonical example URL",
    ],
    [
      "https://demo.petrinaut.org/examples/gases-1-pn/versions/1",
      404,
      "The url parameter is not a canonical example URL",
    ],
    [
      "https://demo.petrinaut.org/examples/not-an-example",
      404,
      "Unknown example: not-an-example",
    ],
  ] as const)(
    "rejects an unsupported source URL (%s)",
    async (sourceUrl, expectedStatus, expectedError) => {
      const response = await fetch(endpointRequest(sourceUrl));

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await responseJson(response)).toEqual({ error: expectedError });
    },
  );

  it("answers unimplementable format requests with 501", async () => {
    const response = await fetch(
      endpointRequest("https://demo.petrinaut.org/examples/gases-1-pn", {
        format: "xml",
      }),
    );

    expect(response.status).toBe(501);
    expect(await responseJson(response)).toEqual({
      error: "Only the json oEmbed format is supported",
    });
  });

  it("serves HEAD like GET with an empty body", async () => {
    const response = await fetch(
      endpointRequest("https://demo.petrinaut.org/examples/gases-1-pn", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.text()).toBe("");
  });

  it("answers HEAD with an empty body on the error paths too", async () => {
    const response = await fetch(
      endpointRequest("https://example.com/examples/gases-1-pn", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("drops a multi-item selection: an embed URL carries one item", async () => {
    const source = new URL("https://demo.petrinaut.org/examples/gases-1-pn");
    source.searchParams.append("items", "place:place-1");
    source.searchParams.append("items", "transition:transition-1");

    const response = await fetch(endpointRequest(source.href));
    const body = await responseJson(response);

    expect(body.html).not.toContain("items");
    expect(body.html).not.toContain("place-1");
  });

  it("returns a CORS preflight response", async () => {
    const response = await fetch(
      endpointRequest(undefined, { method: "OPTIONS" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, HEAD, OPTIONS",
    );
  });

  it("rejects unsupported methods", async () => {
    const response = await fetch(
      endpointRequest(undefined, { method: "POST" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await responseJson(response)).toEqual({
      error: "Method not allowed",
    });
  });
});
