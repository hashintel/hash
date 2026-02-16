/**
 * Content Security Policy configuration for the HASH frontend.
 *
 * Currently deployed as Report-Only. To enforce, change the header name in
 * middleware.page.ts from `Content-Security-Policy-Report-Only` to
 * `Content-Security-Policy`.
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
