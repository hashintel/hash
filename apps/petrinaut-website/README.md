---
layer: website
role: Demo site and embed host for the Petrinaut editor
---

# Petrinaut Website

A website for demoing Petrinaut (libs/@hashintel/petrinaut).

A SPA with API functions for AI assistance, voice initialization, and JSON
oEmbed discovery.

## Quickstart

```sh
cp .env.example .env.local
# add your OPENAI_API_KEY to .env.local, if you want to use the chat feature

turbo run dev
```

The dev server runs at [http://localhost:5173](http://localhost:5173). A plugin in `vite.config.ts` loads the API functions.

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
turbo run dev --filter @apps/petrinaut-website -- --with-optimizer-service
```

The flag builds and starts the local Petrinaut Opt Docker image, waits for its
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

| Name                             | Required         | Used by          | Notes                                                      |
| -------------------------------- | ---------------- | ---------------- | ---------------------------------------------------------- |
| `OPENAI_API_KEY`                 | for chat to work | `api/chat.ts`    | OpenAI key the function uses to call `streamText`.         |
| `OPENAI_VOICE_API_KEY`           | for voice        | voice API        | Dedicated OpenAI key used to create Realtime WebRTC calls. |
| `PETRINAUT_OPENAI_VOICE_ENABLED` | no               | voice API        | Set to `true` to enable voice outside production.          |
| `PETRINAUT_AI_MODEL`             | no               | `api/chat.ts`    | Overrides the default OpenAI model id.                     |
| `PETRINAUT_OPT_ORIGIN`           | no               | `vite.config.ts` | Overrides the local optimizer proxy target.                |
| `VITE_BRUNCH_CHAT_ENDPOINT`      | for Brunch       | website          | Base URL of the mounted Brunch Flue route.                 |
| `VITE_PETRINAUT_OPT_PROVIDER`    | no               | website          | Set to `service` to enable the optimization route.         |
| `SENTRY_DSN`                     | no               | `vite.config.ts` | Wired into the bundle via `__SENTRY_DSN__` at build time.  |

Local values live in `.env.local`; Vite's `loadEnv` (see [`vite.config.ts`](vite.config.ts)) copies them into `process.env` for both the dev server and the API functions. In production, set these in the Vercel project settings.

### Brunch Voice mode preview

Voice mode is disabled by default and always unavailable when `VERCEL_ENV` is
`production`. To exercise the preview locally or in a Vercel preview, set a
real `VITE_BRUNCH_CHAT_ENDPOINT`, `PETRINAUT_OPENAI_VOICE_ENABLED=true`, and a
dedicated `OPENAI_VOICE_API_KEY`.

Text and Voice mode use one assistant transcript and composer. When Voice mode
is available, the empty first-run prompt and empty composer show a waveform
action; non-whitespace text replaces it with **Send**, and a busy assistant
shows **Stop**. Starting Voice mode opens an inline, versioned consent
disclosure before requesting microphone access. The disclosure also provides a
microphone check and is remembered in browser storage only after Voice mode
starts.

When Brunch is selected, typed turns and completed Voice transcripts both enter
the same mounted Flue conversation route. Each logical turn carries a stable
delivery key so a replayed request converges on the existing admission instead
of creating another turn. If admission cannot be confirmed, the UI reports the
ambiguity and does not retry automatically. **Stop** requests a durable Brunch
abort before the panel cancels its local response stream. Local playback
cancellation remains separate and does not alter canonical history. Canonical
Flue history is the source used when the same net is reopened. Automated
coverage guards a locally submitted turn from an older hydration snapshot and
does not resubmit turns or replay settled audio. The real hard-reload witness is
still pending, so reload parity is not yet claimed for this preview.
Voice-origin client-tool results retain their markers in Flue history. Direct
spoken user turns remain canonical text, but Flue 2.0.3 does not yet expose the
caller delivery metadata needed to restore their Voice chip after reopening.

An active session stays at the end of the transcript. Its compact divider shows
a waveform and **Connecting**, **Listening**, **Speaking**, **Paused**, or a
recovery state. Listening levels follow microphone input; provisional words
appear immediately above the divider in an ephemeral user-style bubble. The
bubble is replaced by the finalized message or pending-question tool output,
which retains a waveform indicator without duplicating the answer. Provisional
transcription and Realtime audio are not persisted as chat history.

The text composer remains available. Sending typed text ends Voice mode first,
then submits the draft exactly once through the same conversation; a failed
handoff restores the draft. Closing the assistant pauses capture and speech
before hiding it. Reopening preserves the mounted session in **Paused** state.
The dock exposes **Your turn** while canonical audio owns the turn. That action
clears pending input and output, waits for the provider's matching
acknowledgements and response terminal event, and only then opens the
microphone for fresh capture. Its playback menu offers **Repeat question** and
**Read full response**. Full-response replay becomes available once the matching
response and audio output have both finished, enqueues all exact retained
canonical segments in order, and is disabled during capture, submission,
cancellation, pause, and errors. **Repeat question** has the same safety gates
and replays only exact question text carrying Brunch's non-interactive marker;
if the marker is missing, malformed, or does not match finalized prose, the
action stays disabled rather than guessing from the final segment.

The browser sends its SDP offer to this app; the server initializes a trusted
`gpt-realtime-2` audio-input/audio-output session through OpenAI's unified
Realtime call endpoint. The provider key, model, instructions, language, and
vocabulary policy stay server-side. Realtime exposes no tools, uses
`tool_choice: "none"`, and configures semantic VAD to detect an input boundary
without creating a model response.

Realtime is the disposable media plane: it carries microphone and remote audio,
detects complete turns, and transcribes input. Brunch remains the control plane
and sole authority for questions, captures, state, completion, and durable
history. The bridge accepts only
`conversation.item.input_audio_transcription.completed` as an answer, ignores
model function arguments, and submits the normalized transcript through
Petrinaut's shared composer path. Connection epoch, item id, and content index
form its stable identity. Duplicate, empty, failed, unavailable, and over-limit
transcripts never submit; recoverable failures leave a not-heard or too-long
notice in the dock. Provisional transcription remains display-only.

The bridge waits for the correlated Brunch turn before returning canonical
speech segments to Realtime. It instructs Realtime to speak only those
segments. Generated audio is not a verbatim recording: canonical Brunch text
remains visible and authoritative. Voice is half-duplex: the physical
microphone is closed while the interviewer speaks, while Brunch is working, and
through cancellation. Audio captured before a **Your turn** handoff is
discarded and cannot become a later answer.

The local Brunch preview reaches the mounted route through its same-origin, protocol-preserving proxy; this does not establish remote authentication or public ingress. Denying microphone permission leaves the text composer available and submits nothing to Brunch. When Voice mode cannot continue, the inline recovery state distinguishes microphone, connection, and other Voice failures, explains the next action, and offers **Reconnect** where appropriate. Sanitized error codes and diagnostic references remain collapsed under **Technical details**.

Realtime connection, transcription, and canonical speech timings use random
request IDs, and the existing Brunch transport provides its own request
correlation. Browser and server diagnostics report only operation, stage,
outcome, duration, request ID, and—where applicable—status or a sanitized error
code. Voice responses also expose privacy-safe `Server-Timing` metrics. These
diagnostics never record audio, SDP, transcript or prompt contents, canonical
speech text, credentials, or provider response bodies. This controlled-preview
evidence does not enable production: production remains unconditionally
disabled by the server policy.

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
