/**
 * Content Security Policy configuration for the HASH frontend.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 */

import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

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
      // Next.js dev mode uses eval() for Fast Refresh / HMR
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
 * - `connect-src` is `'none'` — the iframe should not talk to anyone over
 *   the network. All persistence + AI requests round-trip through the host
 *   via postMessage.
 * - `frame-ancestors 'self'` — only HASH itself may embed this route.
 * - `worker-src` allows `blob:` because Monaco / petrinaut spawn workers
 *   from blob URLs.
 */
export const buildEmbedCspHeader = (nonce: string): string => {
  const directives: Record<string, string[]> = {
    "default-src": ["'none'"],

    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'wasm-unsafe-eval'",
      // The whole point of the embed route: user-provided code is compiled
      // with `new Function()`, which requires `'unsafe-eval'`. Contained to
      // the null-origin iframe.
      "'unsafe-eval'",
    ],

    "style-src": [
      "'self'",
      // Required for Emotion/MUI CSS-in-JS inline style injection.
      "'unsafe-inline'",
    ],

    "img-src": ["'self'", "data:", "blob:"],

    "font-src": ["'self'", "data:"],

    "connect-src": ["'self'"],

    "worker-src": ["'self'", "blob:"],

    "frame-src": ["'none'"],

    "frame-ancestors": ["'self'"],

    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
  };

  return buildDirectiveString(directives);
};
