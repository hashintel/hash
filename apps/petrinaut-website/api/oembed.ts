import {
  getExampleCatalogEntry,
  isExampleSlug,
  PETRINAUT_DEMO_ORIGIN,
  type ExampleSlug,
} from "../src/examples/catalog-metadata";
import {
  canonicalSearchString,
  validateSharedExampleSearch,
} from "../src/examples/example-search";

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 450;
const SUCCESS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

type OEmbedResponse = Readonly<{
  type: "rich";
  version: "1.0";
  title: string;
  provider_name: "Petrinaut";
  provider_url: typeof PETRINAUT_DEMO_ORIGIN;
  width: number;
  height: number;
  html: string;
}>;

const corsHeaders = (): Headers =>
  new Headers({
    "Access-Control-Allow-Headers": "Accept",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Origin": "*",
  });

const jsonResponse = (
  body: unknown,
  init: ResponseInit & { cacheable?: boolean } = {},
): Response => {
  const { cacheable = false, ...responseInit } = init;
  const headers = corsHeaders();
  for (const [name, value] of new Headers(responseInit.headers)) {
    headers.set(name, value);
  }
  headers.set("Cache-Control", cacheable ? SUCCESS_CACHE_CONTROL : "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), { ...responseInit, headers });
};

const errorResponse = (
  status: 400 | 404 | 405 | 501,
  error: string,
): Response => jsonResponse({ error }, { status });

const readPositiveFiniteMaximum = (
  searchParams: URLSearchParams,
  name: "maxheight" | "maxwidth",
): number | undefined | null => {
  if (!searchParams.has(name)) {
    return undefined;
  }

  const rawValue = searchParams.get(name);
  // A consumer that always appends the optional oEmbed params sends them
  // empty when the user set no size. That is "no maximum", not a bad request.
  if (rawValue === null || rawValue.trim() === "") {
    return undefined;
  }

  // oEmbed defines these as integers. `Number` would also accept `0x10`,
  // `1e3` and ` 400 `, which are typos rather than sizes.
  if (!/^[0-9]+$/u.test(rawValue.trim())) {
    return null;
  }

  const value = Number(rawValue.trim());
  return value > 0 ? value : null;
};

const fitDimensions = (
  maxWidth: number | undefined,
  maxHeight: number | undefined,
): { width: number; height: number } => {
  const scale = Math.min(
    1,
    maxWidth === undefined ? 1 : maxWidth / DEFAULT_WIDTH,
    maxHeight === undefined ? 1 : maxHeight / DEFAULT_HEIGHT,
  );

  // Height follows from the clamped width, so the aspect ratio survives.
  // Flooring each axis independently turns `?maxwidth=1` into a 1x1 embed.
  const width = Math.max(1, Math.floor(DEFAULT_WIDTH * scale));
  return {
    width,
    height: Math.max(1, Math.round((width * DEFAULT_HEIGHT) / DEFAULT_WIDTH)),
  };
};

const escapeHtmlAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

type ParsedExampleUrl = Readonly<{
  slug: ExampleSlug;
  embedSearch: URLSearchParams;
}>;

/**
 * Carry over only state the embed page understands, by decoding the canonical
 * URL through the shared contract and re-encoding it. One embed-specific rule:
 * embeds always show a named scenario, so an explicit `none` (valid on the
 * canonical page) resolves to the model's first scenario instead.
 */
const sanitizeEmbedSearch = (source: URLSearchParams): URLSearchParams => {
  const search = validateSharedExampleSearch(Object.fromEntries(source));

  return new URLSearchParams(
    canonicalSearchString(
      search.scenario === "none" ? { ...search, scenario: undefined } : search,
    ),
  );
};

const parseExampleUrl = (
  rawUrl: string,
): ParsedExampleUrl | { error: string; status: 400 | 404 } => {
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    return { error: "The url parameter must be a valid URL", status: 400 };
  }

  // A well-formed URL this provider cannot embed is 404 rather than 400.
  // oEmbed 1.0 section 2.3.1 lists 404 for "no response for this url", and
  // consumers branch on it to fall back to a plain link.
  if (sourceUrl.origin !== PETRINAUT_DEMO_ORIGIN) {
    return {
      error: `The url parameter must use ${PETRINAUT_DEMO_ORIGIN}`,
      status: 404,
    };
  }

  const pathMatch = sourceUrl.pathname.match(/^\/examples\/([^/]+?)\/?$/u);
  if (!pathMatch) {
    return {
      error: "The url parameter is not a canonical example URL",
      status: 404,
    };
  }

  const slug = pathMatch[1]!;
  if (!isExampleSlug(slug)) {
    return { error: `Unknown example: ${slug}`, status: 404 };
  }

  return {
    slug,
    embedSearch: sanitizeEmbedSearch(sourceUrl.searchParams),
  };
};

const respond = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    const headers = corsHeaders();
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(null, { headers, status: 204 });
  }

  const isHead = request.method === "HEAD";
  if (request.method !== "GET" && !isHead) {
    const response = errorResponse(405, "Method not allowed");
    response.headers.set("Allow", "GET, HEAD, OPTIONS");
    return response;
  }

  const endpointUrl = new URL(request.url);
  // An empty `format=` means the consumer expressed no preference, and the
  // parameter is case-insensitive in practice.
  const format =
    endpointUrl.searchParams.get("format")?.trim().toLowerCase() || null;
  if (format !== null && format !== "json") {
    // oEmbed 1.0 section 2.3.1: a format the provider cannot return is 501.
    return errorResponse(501, "Only the json oEmbed format is supported");
  }

  const rawSourceUrl = endpointUrl.searchParams.get("url");
  if (!rawSourceUrl) {
    return errorResponse(400, "Missing required url parameter");
  }

  const parsedExampleUrl = parseExampleUrl(rawSourceUrl);
  if ("error" in parsedExampleUrl) {
    return errorResponse(parsedExampleUrl.status, parsedExampleUrl.error);
  }

  const maxWidth = readPositiveFiniteMaximum(
    endpointUrl.searchParams,
    "maxwidth",
  );
  if (maxWidth === null) {
    return errorResponse(400, "maxwidth must be a positive integer");
  }
  const maxHeight = readPositiveFiniteMaximum(
    endpointUrl.searchParams,
    "maxheight",
  );
  if (maxHeight === null) {
    return errorResponse(400, "maxheight must be a positive integer");
  }

  const { width, height } = fitDimensions(maxWidth, maxHeight);
  const embedUrl = new URL(
    `/embed/examples/${parsedExampleUrl.slug}`,
    PETRINAUT_DEMO_ORIGIN,
  );
  embedUrl.search = parsedExampleUrl.embedSearch.toString();

  const catalogEntry = getExampleCatalogEntry(parsedExampleUrl.slug)!;
  const response: OEmbedResponse = {
    type: "rich",
    version: "1.0",
    title: catalogEntry.title,
    provider_name: "Petrinaut",
    provider_url: PETRINAUT_DEMO_ORIGIN,
    width,
    height,
    html: `<iframe src="${escapeHtmlAttribute(embedUrl.href)}" title="${escapeHtmlAttribute(catalogEntry.title)}" width="${width}" height="${height}" style="border:0" loading="lazy" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" allowfullscreen></iframe>`,
  };

  return jsonResponse(response, { cacheable: true });
};

/**
 * Serve Petrinaut example embeds using the JSON oEmbed 1.0 contract.
 *
 * Exported only through the default `{ fetch }` object, matching `chat.ts`, so
 * Vercel's Node.js runtime treats this as a Web fetch handler and hands us a
 * `Request`. Without that opt-in the default export is invoked with a Node.js
 * `IncomingMessage`, which has no `Request` API.
 *
 * See https://vercel.com/changelog/node-js-vercel-functions-now-support-fetch-web-handlers
 */
const fetch = async (request: Request): Promise<Response> => {
  const response = await respond(request);
  // Strip the body at the single exit, so error replies to HEAD are bodiless
  // too rather than only the 200.
  return request.method === "HEAD"
    ? new Response(null, { headers: response.headers, status: response.status })
    : response;
};

export default { fetch };
