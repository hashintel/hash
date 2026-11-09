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

/**
 * Whether `pathname` is the process editor (`/processes/<uuid>` or
 * `/processes/draft`, with an optional trailing slash), the one route whose
 * policy lets Petrinaut evaluate strings and load its `data:` fonts.
 *
 * The policy belongs to the document, not the route, so a client-side
 * navigation keeps it. The process editor therefore reloads the document
 * both on arriving from another route and on leaving for one.
 */
export const isProcessEditorPath = (pathname: string): boolean =>
  /^\/processes\/[^/]+\/?$/.test(pathname);

export const buildCspHeader = ({
  nonce,
  pathname,
}: {
  nonce: string;
  /** The request's pathname, which decides the route-specific allowances. */
  pathname: string;
}): string => {
  const isProcessEditor = isProcessEditorPath(pathname);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    "script-src": [
      "'self'",
      // set via middleware.page.ts
      `'nonce-${nonce}'`,
      // WebAssembly instantiation (webpack asyncWebAssembly is enabled)
      "'wasm-unsafe-eval'",
      // Next.js dev mode uses eval() for Fast Refresh / HMR.
      // Petrinaut, rendered in the process editor, compiles its programs and
      // evaluates the ad-hoc form's constant values with `new Function`.
      // @todo Run Petrinaut without 'unsafe-eval' and drop this allowance:
      //   https://linear.app/hash/issue/FE-2142
      ...(process.env.NODE_ENV === "development" || isProcessEditor
        ? ["'unsafe-eval'"]
        : []),
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

    "font-src": [
      "'self'",
      // Petrinaut, rendered in the process editor, ships its fonts as data: URLs.
      // Development allows them everywhere, as it does string evaluation:
      // there the editor never reloads into its own policy, because
      // evaluation already works, so a document that arrived from another
      // route would otherwise render Petrinaut without its fonts.
      ...(process.env.NODE_ENV === "development" || isProcessEditor
        ? ["data:"]
        : []),
    ],

    "connect-src": [
      "'self'",
      // deck.gl's IconLayer (NetworkGraph icon/arrow atlases) fetches its
      // `canvas.toDataURL()` atlas, and fetching a data: URL is governed by
      // connect-src.
      "data:",
      // API server (GraphQL, OAuth callbacks, file uploads, auth via Ory Kratos, and the atlas
      // tile surface it proxies under the session's actor)
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
