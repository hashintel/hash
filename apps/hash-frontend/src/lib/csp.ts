/**
 * Content Security Policy configuration for the HASH frontend.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 */

import {
  apiOrigin,
  frontendUrl,
} from "@local/hash-isomorphic-utils/environment";

const buildDirectiveString = (directives: Record<string, string[]>): string =>
  Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");

export const buildCspHeader = (nonce: string): string => {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    "script-src": [
      "'self'",
      // set via middleware.page.ts
      `'nonce-${nonce}'`,
      // WebAssembly instantiation (webpack asyncWebAssembly is enabled)
      "'wasm-unsafe-eval'",
      // Next.js dev mode uses eval() for Fast Refresh / HMR.
      ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
      // Google Identity Services (OAuth sign-in)
      "https://accounts.google.com",
      // Google Picker API (Google Sheets integration)
      "https://apis.google.com",
      // Vercel toolbar / live preview widget
      "https://vercel.live",
    ],

    "style-src": [
      "'self'",
      // Required for Emotion/MUI CSS-in-JS inline style injection.
      // @todo Use nonce-based approach via Emotion's cache `nonce` option.
      "'unsafe-inline'",
    ],

    "img-src": [
      "'self'",
      "data:",
      "blob:",
      // File uploads are served via the API's /file/ proxy which 302-redirects
      // to presigned S3/R2 URLs on varying domains. `https:` avoids needing to
      // enumerate every possible storage backend domain.
      "https:",
      // Local S3-compatible storage (MinIO) serves over plain HTTP
      ...(process.env.NODE_ENV === "development" ? ["http:"] : []),
    ],

    "font-src": ["'self'"],

    "connect-src": [
      "'self'",
      // API server (GraphQL, OAuth callbacks, file uploads, auth via Ory Kratos)
      apiOrigin,
      // Sentry error reporting and session replay
      "https://*.ingest.sentry.io",
      // Google APIs (OAuth, Drive)
      "https://www.googleapis.com",
      // Vercel Edge Config (maintenance mode check in middleware)
      "https://edge-config.vercel.com",
      // Vercel toolbar / live preview widget
      "https://vercel.live",
      // File uploads/downloads use presigned S3/R2 URLs on varying domains.
      // Production storage is always HTTPS; local MinIO uses plain HTTP.
      "https:",
      ...(process.env.NODE_ENV === "development" ? ["http:"] : []),
    ],

    "worker-src": [
      "'self'",
      // Sentry session replay blob workers; graph visualizer web worker
      "blob:",
    ],

    "frame-src": [
      "'self'",
      // Google Identity Services sign-in iframe
      "https://accounts.google.com",
      // Google Picker iframe
      "https://docs.google.com",
      // Vercel toolbar / live preview widget
      "https://vercel.live",
    ],

    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  return buildDirectiveString(directives);
};

/**
 * Stricter CSP for the Petrinaut embed route (`/processes/<uuid>/embed`).
 *
 * The embed route is loaded into a sandboxed null-origin iframe so user-
 * provided code (place visualizers, metric/scenario expressions) can be
 * compiled with `new Function()` without endangering the parent HASH origin.
 *
 * Key differences vs the default CSP:
 * - `script-src` includes `'unsafe-eval'` so Babel + `new Function()` work.
 *   Unlike the rest of the app it uses `'unsafe-inline'` rather than a nonce:
 *   the embed's security boundary is the opaque-origin sandbox, not its CSP —
 *   it deliberately executes arbitrary user code via `'unsafe-eval'`, so
 *   nonce-gating its inline framework scripts buys nothing here
 *   (and a nonce would disable it: @see https://www.w3.org/TR/CSP3/#allow-all-inline).
 * - `connect-src` is `'self'` only — from the opaque-origin sandbox this is
 *   effectively no network reach. All persistence + AI requests deliberately
 *   round-trip through the host via postMessage instead.
 * - `frame-ancestors` — only the HASH frontend may embed this route. Spelled
 *   out via {@link frontendUrl} for the same opaque-origin reason as the asset
 *   directives (`'self'` alone matches no ancestor here).
 * - `worker-src` allows `blob:` because Monaco / petrinaut spawn workers
 *   from blob URLs.
 */
export const buildEmbedCspHeader = (): string => {
  const directives: Record<string, string[]> = {
    "default-src": ["'none'"],

    "script-src": [
      // The embed's opaque origin makes `'self'` match nothing; reference the
      // real origin so Next.js chunks load.
      frontendUrl,
      "'self'",
      // Isolation here is the opaque-origin sandbox, not the CSP, and the
      // route already runs arbitrary user code via `'unsafe-eval'`, so a
      // script nonce adds nothing. `'unsafe-inline'` (with the nonce
      // deliberately omitted, since a nonce would disable it).
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      // The whole point of the embed route: user-provided code is compiled
      // with `new Function()`, which requires `'unsafe-eval'`. Contained to
      // the null-origin iframe.
      "'unsafe-eval'",
    ],

    "style-src": [
      frontendUrl,
      "'self'",
      // Required for Emotion/MUI CSS-in-JS inline style injection.
      "'unsafe-inline'",
    ],

    "img-src": [frontendUrl, "'self'", "data:", "blob:"],

    "font-src": [frontendUrl, "'self'", "data:"],

    // Effectively no real reach from the opaque-origin sandbox — see the
    // `connect-src` note in this function's doc comment.
    "connect-src": ["'self'"],

    "worker-src": [frontendUrl, "'self'", "blob:"],

    "frame-src": ["'none'"],

    "frame-ancestors": [frontendUrl, "'self'"],

    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
  };

  return buildDirectiveString(directives);
};
