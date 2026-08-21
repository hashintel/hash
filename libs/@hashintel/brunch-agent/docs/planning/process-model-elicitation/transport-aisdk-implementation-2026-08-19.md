# FE-1436 transport-aisdk implementation record

**Date:** 2026-08-19
**Source:** `ln/fe-1436-transport-aisdk`, stacked on the FE-1435 panel-spike branch
**Contract input:** `test/fixtures/transport-aisdk/` from the real-panel FE-1435 run

## Outcome

The production-intent transport path now crosses the real boundary that the spike identified:

```text
Petrinaut ChatTransport POST
  -> apps/dev /api/chat application route
  -> Flue-backed GherkinElicitor
  -> substrate-neutral HarnessReplyEvent stream
  -> transport-aisdk AI SDK v6 encoder
  -> Petrinaut UI-message SSE renderer
```

`transport-aisdk` depends only on `@brunch/core`, `ai`, and `valibot`. Valibot establishes trust
at the external POST boundary; the Flue chunk projection stays in `binding-flue`, and the
application composes the two. Dependency and physical-resolution gates make that split
executable. No fetch shim, alternate conversation renderer, or disposable server loop is part
of the path.

The frozen initial POST drives the committed application route, actual Gherkin elicitor, Flue
reply projector, and AI SDK transport; the complete normalized SSE sequence is compared with a
committed golden fixture. A separate wire test encodes a fixed harness event sequence and
reproduces the spike's initial SSE byte-for-byte. The frozen automatic tool-result POST is also
a contract input: this slice refuses it with `422 tool_result_follow_up_not_supported` before
dispatch, rather than misclassifying Petrinaut's synthetic diagnostics message as user evidence.
FE-1438 (the client-tool round-trip) owns admitting that machine-input protocol.

## Inspection surface

Set `BRUNCH_TRANSPORT_AISDK_INSPECT=1` on the application server to emit one JSON object per line, prefixed
with `TRANSPORT_AISDK`. The committed stream reports request, response, and turn boundaries;
part kinds; stable message, part, turn, and tool-call ids; and the terminal state. The sink is
endpoint-side only and is never dispatched into the elicitor, stored as conversation content, or
offered to evidence capture.

## Repeatable local panel run

Build the clean external hash checkout, then start the committed application server and real-panel launcher:

```sh
cd /path/to/hash
turbo run build --filter=@apps/petrinaut-website...

cd /path/to/brunch-lite
BRUNCH_TRANSPORT_AISDK_INSPECT=1 \
BRUNCH_PETRINAUT_ORIGINS=http://127.0.0.1:4915 \
bun run --cwd apps/dev dev --host 127.0.0.1 --port 4321

PETRINAUT_WEBSITE_ROOT=/path/to/hash/apps/petrinaut-website \
BRUNCH_CHAT_ORIGIN=http://127.0.0.1:4321 \
bun run --cwd apps/dev petrinaut:dev --host 127.0.0.1 --port 4915
```

The launcher loads hash's own Vite configuration, removes only its incumbent development
`/api/chat` handler, and proxies that route to the brunch application server. It does not edit hash.

## Observed evidence

The 2026-08-19 run used hash commit `1046b5c881cd00cf205b4895348b022934d66b4a`.
The real Petrinaut panel issued a same-origin `/api/chat` POST and received a `200` AI SDK v6
event stream. It rendered expandable reasoning and this elicitor text after an actual panel
follow-up:

> What I heard: A shopper completes an online shopping cart and receives an order
> confirmation. This is a basic e-commerce scenario covering the checkout and confirmation
> flow.

The corresponding inspection stream preserved message id
`entry_01M0CXCAZ8S9S326SM91V6BZX5`, turn id
`turn_01M0CXCACJET69FNEGTVTJP29W`, reasoning part id ending `:reasoning:1`, text part id
ending `:text:2`, and tool-call id `toolu_01RkHpPgUKwFJUzbYCJnbRuz`; it terminated as
`completed` with finish reason `stop`. The hash checkout was still on the same commit with no
tracked changes after the run.

The elicitor's structured `brunch_ask` currently appears as a server-executed tool part; the
plain-text and reasoning conversation path is live. FE-1449 (structured ask in the panel)
owns rendering that ask as an interactive client affordance.

> **Reflection:** Re-rendering the implementation as a boundary crossing exposed the useful
> negative contract: refusing tool-result follow-ups is not an absent feature hidden by the
> happy path. It is the guard that keeps synthetic diagnostics out of user evidence until the
> machine-entry protocol exists.
