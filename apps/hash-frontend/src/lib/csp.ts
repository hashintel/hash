/**
 * Content Security Policy configuration for the HASH frontend.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 */

import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

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

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
};

/**
 * CSP for the Petrinaut iframe eval sandbox page
 * (`/petrinaut-sandbox`).
 *
 * The sandbox bundle (see `@hashintel/petrinaut/sandbox-runtime`)
 * needs to call `new Function(...)` / `eval` to compile user-authored
 * code at runtime, so we cannot share the strict app-wide CSP that
 * forbids `unsafe-eval`. Instead this CSP:
 *
 *  - Allows `'unsafe-eval'` so `Function()` succeeds.
 *  - Sets `connect-src 'none'` so the iframe — even though it can
 *    `eval` arbitrary user code — cannot make any network request
 *    (no `fetch`, no `XMLHttpRequest`, no `WebSocket`, no Sentry I/O).
 *  - Sets `default-src 'none'` so the iframe also can't load images,
 *    audio, fonts, etc., except for the narrow exceptions we whitelist.
 *  - Permits `worker-src 'self' blob:` so the simulation/Monte Carlo
 *    workers spawned by the sandbox runtime still work.
 *  - Sets `frame-ancestors 'self'` so only the parent app (this same
 *    origin) can embed the sandbox; nobody else can iframe it.
 *
 * Combined with `sandbox="allow-scripts"` on the iframe element
 * (parent side), the sandbox runs in an opaque origin without cookies
 * and cannot exfiltrate data over the network.
 */
export const buildSandboxCspHeader = (nonce: string): string => {
  const directives: Record<string, string[]> = {
    "default-src": ["'none'"],

    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      // The whole point: allow Function()/eval() of user-authored code.
      "'unsafe-eval'",
      // WebAssembly used by webpack asyncWebAssembly chunks.
      "'wasm-unsafe-eval'",
    ],

    "style-src": [
      "'self'",
      // Emotion / runtime style injection inside the visualizer.
      "'unsafe-inline'",
    ],

    "img-src": ["'self'", "data:", "blob:"],

    "font-src": ["'self'", "data:"],

    // Critical: no network access from inside the sandbox iframe.
    // User code can call fetch() / XHR but every request will be
    // blocked by the browser before it leaves the origin.
    "connect-src": ["'none'"],

    "worker-src": ["'self'", "blob:"],

    "frame-src": ["'none'"],

    // Only the parent app may embed this page.
    "frame-ancestors": ["'self'"],

    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
};
