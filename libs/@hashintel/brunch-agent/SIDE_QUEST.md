# Side quest — Make Brunch chat failures attributable

## Status

Active inside live [Mission 7b](MISSION.md). Authorized by Lu on 2026-09-10 after the real product tracer attempts failed opaquely. This quest grants no concurrent work and no new paid allocation beyond the mission's existing development-inference authorization.

## Relationship to the live mission

Mission 7b's current throughline is the bounded candidate-mode `mutate_petrinet` tracer through the real product path. Its Status records that "another paid attempt waits for usable product diagnostics rather than repeating opaque failures". The residual failure this quest addresses is that the product swallows or under-reports failures on every layer the tracer crosses:

- The server registers two Flue instruments whose `observe()` bodies are empty, so failed tools, turns, tasks, compactions, settlements and recoveries leave no server-side record; `@flue/opentelemetry` runs with `content: false` and OTLP is not wired in development.
- Several server paths convert failures into apparently successful values before Flue can observe them: malformed `client-tool-result` signals are dropped, `brunch_why` internal exceptions become a `refused` disposition, malformed admission JSON is ignored, and poisoned request-accounting paths are silent.
- The browser panel routes every failure into one toast (`setStreamError`) with no capture, `tool-output-error` chunks bypass `useChat.onError` entirely, hidden-tool errors are dropped before projection, and host-contained mutation, observation and history failures resolve normally.

Investigating these does not change the mission's imperative, throughline or proof. It supplies the diagnostics the next real attempt requires, then returns to the route decision.

## Imperative

Every non-Voice failure encountered on the Brunch chat path — panel submission → Flue runtime → server or client tool execution → settlement/history — must be attributable from the server terminal or the browser console by stage and correlation identity, with the original error and stack in development, without changing what the panel or the model observes.

## Throughline

```text
SIDE_QUEST.md committed alone
→ server diagnostic sink: content-aware logger + one Flue observer + contained-failure reports
→ browser diagnostic sink: ErrorTracker context carries source/correlation; provider prints in dev, classifies in production
→ transport reports server tool-output errors, including hidden tools, before projection drops them
→ panel, host tools, transition recorder and history report at their source
→ focused privacy/coverage tests; affected package checks
→ one bounded real mutation-tracer attempt through `yarn dev:brunch`
→ record the observation for the Mission 7b route decision; remove this file
```

## Proof

| Result | Oracle |
| --- | --- |
| Server failures are observable | Unit test: a Flue `tool`/`turn`/`compaction`/`operation`/`submission_settled`/`submission_recovery` failure observation produces exactly one logger call carrying event kind and runtime IDs. Development output includes original message and stack; production output contains neither. |
| Contained server failures are reported without leaking content | Unit tests: a malformed `client-tool-result` body reports classification and count only; `brunch_why` refusal from an internal exception reports the error; the sentinel body text never appears in any logger call. |
| Browser transport reports tool errors | Unit test in `transport-aisdk`: a `tool-output-error` chunk for a visible tool and for a hidden tool both invoke the diagnostic callback; the hidden tool still produces no UI chunk. |
| Panel reports operational failures only | Unit test: a stream error reaches `ErrorTracker.captureException` with a source; an empty-text submission refusal does not. |
| Provider honours the environment policy | Unit test: development prints the original error to the console; production forwards a classified error plus tags to Sentry and never the original message. |
| Real attempt is attributable | Human witness (Lu or the operating agent): during one bounded real mutation-tracer attempt, every encountered failure appears in the server terminal or browser console with stage and correlation ID. The panel and model outcomes are unchanged from before this quest. |

This quest does not claim that the batch premise passes, that any underlying defect is fixed, or that production telemetry is wired.

## Constraints

- Voice paths are excluded.
- Do not repair or wire OTLP; the existing content-free failure spans remain as they are.
- Never log prompts, tool arguments or results, request bodies, principal keys or raw conversation IDs. Runtime IDs Flue already generates (submission, turn, tool call, operation, task) are the correlation vocabulary.
- Development may emit original errors and stacks. Production emits only error type/code, stage, tool name and opaque runtime IDs.
- Do not change failure behaviour to make it observable: dispositions, refusals, dropped malformed members, thrown errors and UI state remain as before.
- Reusable Petrinaut stays free of Brunch semantics: the `ErrorTracker` extension is generic (`source`, `tags`).
- Respect the mission's stop conditions and the existing evidence retention contract; no new evidence documents.

## Stop or reorient

- Stop if attributability requires changing a product outcome (a disposition, a refusal, a thrown error) rather than adding a report beside it.
- Stop if a required report cannot avoid content (prompt, arguments, body, principal); leave that path unreported and record it here.
- Stop the real attempt on the first material failure, record what was attributable and what was not, and return to the Mission 7b route decision. Do not fix the underlying defect inside this quest.

## Budget

- Paid activity: one bounded real mutation-tracer attempt under Mission 7b's existing authorization (development inference below USD 100 total per day). Record request count, elapsed time and usage as the mission requires.
- Everything else is unpaid local work.
