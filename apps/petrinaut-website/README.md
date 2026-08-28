# Petrinaut Website

A website for demoing Petrinaut (libs/@hashintel/petrinaut).

A SPA with API functions for AI assistance and JSON oEmbed discovery.

## Quickstart

```sh
cp .env.example .env.local
# add your OPENAI_API_KEY to .env.local, if you want to use the chat feature

turbo run dev
```

The dev server runs at [http://localhost:5173](http://localhost:5173). A plugin in `vite.config.ts` loads the API function.

In production, the functions in the `api` folder are automatically deployed as
Vercel Functions.

## Example embeds and oEmbed

Canonical example pages live below `/examples`. The JSON oEmbed endpoint at
`/api/oembed` accepts their production URLs and returns an
`/embed/examples/...` iframe. Canonical pages send both CSP `frame-ancestors
'none'` and `X-Frame-Options: DENY`; only the dedicated embed routes permit
third-party framing. The returned iframe is sandboxed with
`allow-scripts allow-same-origin` and does not send a referrer.

Because this is a client-rendered SPA, a static `index.html` discovery link
cannot include the current example URL. `FullExamplePage` adds the standard
`application/json+oembed` link to the document head after the route mounts.
Consumers that do not execute JavaScript must call `/api/oembed` directly or
use provider-pattern discovery instead.

### Optimization demo with Petrinaut Opt

From the repository root, run:

```sh
yarn dev:petrinaut-optimization
```

This builds and starts the local Petrinaut Opt Docker image, waits for its
health endpoint, and starts the website with the real optimization provider.
Open [http://localhost:5173/optimization](http://localhost:5173/optimization).
Stopping the command also stops and removes its optimizer container.

The development server proxies `/api/petrinaut-opt/*` to the optimizer on
`127.0.0.1:4004`, avoiding development-only CORS changes to the Python service.
Regular `yarn dev` does not enable optimization; use the dedicated command to
connect the website to the real optimizer service. The `/optimization` route
returns the website's not-found page when the provider is disabled. Storybook
provides a fake optimizer for isolated UI development.

## Environment variables

| Name                          | Required         | Used by          | Notes                                                     |
| ----------------------------- | ---------------- | ---------------- | --------------------------------------------------------- |
| `OPENAI_API_KEY`              | for chat to work | `api/chat.ts`    | OpenAI key the function uses to call `streamText`.        |
| `PETRINAUT_AI_MODEL`          | no               | `api/chat.ts`    | Overrides the default OpenAI model id.                    |
| `PETRINAUT_OPT_ORIGIN`        | no               | `vite.config.ts` | Overrides the local optimizer proxy target.               |
| `VITE_PETRINAUT_OPT_PROVIDER` | no               | website          | Set to `service` to enable the optimization route.        |
| `SENTRY_DSN`                  | no               | `vite.config.ts` | Wired into the bundle via `__SENTRY_DSN__` at build time. |

Local values live in `.env.local`; Vite's `loadEnv` (see [`vite.config.ts`](vite.config.ts)) copies them into `process.env` for both the dev server and the chat function. In production, set these in the Vercel project settings.

## Testing the API against the built output

A plain `yarn build && yarn vite preview` only serves the static `dist/` assets - `/api/chat` will 404 because the dev plugin is not loaded by `vite preview`. Use one of the options below to exercise the production code path locally.

### Option A: `vercel dev` (recommended)

Closest to the real Vercel runtime. It builds the site, bundles the function, and serves both from a single port using the actual Node runtime + routing layer.

Requires linking to a Vercel project. If you don't have access, go for Option B (or just use `turbo run dev` instead).

```sh
cd apps/petrinaut-website

npx vercel link # first-time setup

npx vercel dev             # builds + serves on http://localhost:3000
```

Notes:

- `vercel dev` does not read your existing `dist/`; it rebuilds. If you specifically need to inspect the artifact you already produced, use option B (or amend the devCommand in vercel.json to remove the build step).

### Option B: `vite preview` + a sibling Node API server

Useful when you want to serve the literal `dist/` artifact you just built and avoid the Vercel CLI. It is two processes, glued together by `preview.proxy`.

1. Add a proxy entry to `vite.config.ts` (only needed while you are testing this flow):

   ```ts
   preview: {
     proxy: { "/api": "http://localhost:3001" },
   },
   ```

2. Create a throwaway `scripts/preview-api.mjs` that mounts the same handler with `createServerAdapter`:

   ```js
   import { createServer } from "node:http";
   import { createServerAdapter } from "@whatwg-node/server";
   import handler from "../api/chat.ts";

   createServer(createServerAdapter(handler)).listen(3001, () => {
     console.log("preview API listening on http://localhost:3001");
   });
   ```

3. Run them side by side (Node 22.6+ can execute the TypeScript entry directly with `--experimental-strip-types`):

   ```sh
   yarn build
   yarn vite preview                                          # :4173
   node --experimental-strip-types scripts/preview-api.mjs    # :3001
   ```

`/api/chat` requests against `:4173` will be proxied to the local API server, which loads the same handler the deployed function uses.

## Known caveats

- **In-memory rate limiting.** [`api/chat.ts`](api/chat.ts) keys rate-limit buckets by the client IP that Vercel's edge writes into `x-forwarded-for` (which Vercel actively prevents the caller from spoofing - see the [request headers docs](https://vercel.com/docs/edge-network/headers/request-headers)). The bucket map lives in module scope, so it resets on cold start and is not shared between concurrent function instances.
- **`vercel-build.sh` deletes the repo-root `.env`.** This is intentional (mise picks it up otherwise), but worth knowing if you run `vercel dev` locally and keep secrets there.
