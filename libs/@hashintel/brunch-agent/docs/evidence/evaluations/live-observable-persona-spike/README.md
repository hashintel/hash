# Live-observable persona spike

## Disposition

Completed on 2026-09-02. The spike established a local working line in which one project-defined
Pi persona sent three sequential user turns through `brunch_turn` to the production Brunch Flue
`ChatAgent`, while the existing browser chat and transcript CLI read the same canonical
conversation.

This is mechanism evidence only. It does not establish persona fidelity, elicitation quality,
full-run completion, workpiece quality, repeatability, crash recovery, remote operation, or
production readiness.

The harness is useful for the future `Observability and simulation viewing` planning cluster, but
it is not currently load-bearing for Mission 4 proof item 5. Mission 4 already has a production
headless candidate path, and no candidate attempt has failed because this harness was absent.

## Identity and topology

| Field | Observed value |
| --- | --- |
| Origin | `http://127.0.0.1:4321` |
| Principal | `local` |
| Persona / conversation id | `brunch-persona-spike-20260902a` |
| Flue instance id | `d7878c473bbbf00dc51ff35a9d7caa997d31873d615c4ad688d4eef00c1df35d` |
| Elicitor | production `brunch-chat-agent` |
| Persona model | `anthropic/claude-sonnet-4-6`, medium thinking |
| Elicitor model | production default `anthropic/claude-haiku-4-5` |

Herdr's project-agent discovery resolved `.pi/subagents/brunch-persona.md` from the Brunch context
root as a project definition. Its declared extension resolved to
`.pi/extensions/brunch-turn.ts`. The visible child command used `--no-extensions`, explicitly
loaded the Herdr companion/state extensions and `brunch-turn.ts`, disabled skills, and selected
exactly:

```text
--tools brunch_turn,ask_parent
```

It exposed no `subagent`, shell, file, browser, or web tool.

The actor received a bounded subset of the existing Vestera interviewee pack and a three-turn
mechanism objective. No oracle, target model, repository-reading tool, or scenario fact was added
to the reusable persona definition.

## Commands

The application and static proof used:

```sh
yarn workspace @apps/brunch-agent lint:tsc
yarn workspace @apps/brunch-agent lint:eslint
yarn workspace @apps/brunch-agent test:unit
yarn workspace @apps/brunch-agent build
```

The normal server was started from `apps/brunch-agent` with its Vite `dev` command. The observer
URL was:

```text
http://127.0.0.1:4321/?mode=observe&principal=local&id=brunch-persona-spike-20260902a
```

Canonical history was printed with:

```sh
yarn workspace @apps/brunch-agent transcript -- \
  --principal local \
  --id brunch-persona-spike-20260902a
```

## Turn and submission comparison

| Turn | Persona message | Submission id | Pi reply, observer, and CLI |
| --- | --- | --- | --- |
| 1 | Introduced the scheduling-model objective and requested an interview. | `sub_01M1GSDR0M6F5MDA0H5NSH9FJ5` | Exact elicitor scope questions matched. |
| 2 | Named late orders, changeover hours, hold-versus-washdown, weekly horizon, and users. | `sub_01M1GSE5JCB4FHAHFD11HYGGBJ` | Exact request for a concrete order-transition scenario matched. |
| 3 | Described the three lines, product families, asymmetric changeovers, and a Tuesday example. | `sub_01M1GSEMTX9GYCM2BBCZTA83EK` | Exact follow-up on the waiting decision and order timing matched. |

All submission ids were distinct. Each Pi result rendered the persona message, the settled
submission id, and the exact elicitor text. The browser showed the same three visible user and
assistant message pairs in the same order. The transcript CLI showed that same visible sequence
and additionally retained the canonical diagnostic `activate_skill` tool part; it did not invent a
second chat transcript.

## Live observer and reload

The observer displayed `READ-ONLY` and exposed no textbox, button, composer, or send action. A
normal visit to `/` still displayed the writable textbox and Send button. An observer URL with a
non-`local` principal displayed an explicit identity error and no composer.

Opening the observer before the first admission produced an idle view that did not discover the
subsequently created instance. Reloading after the instance existed reconstructed the first two
settled pairs and established the live subscription. The third user message appeared there and
the observer reported `STREAMING` while its assistant response was in progress. Reloading again
after settlement reconstructed all three pairs in the same order and returned to `IDLE`.

The resulting operational rule is concrete: admit the first turn, then attach the observer.
Pre-creation observation is not a substitute for that ordering. No retry layer or parallel
observer protocol was added.

## Failures and paid activity

The initial actor process used an `@file` reference for the launch-supplied pack. The child did not
receive expanded file contents and correctly raised one `ask_parent` orchestration blocker. After
the bounded pack was supplied through that channel, Pi crashed before any `brunch_turn` call while
rendering the long parent answer: one rendered line exceeded the pane width. Canonical browser
history was inspected and was empty, so there was no admitted or indeterminate Flue submission.
The same conversation identity was safely restarted with the bounded pack inline. A controlled
regression now also proves the `brunch_turn` custom renderer stays within its supplied width.

Paid activity remained within the side-quest cap:

- Persona: five completed model continuations across the pre-admission startup and successful
  three-turn path, plus one possibly in-flight continuation at the renderer crash; conservatively
  counted as six. Pi reported approximately USD 0.062 total.
- Production elicitor: three admitted submissions. Canonical history showed three assistant
  replies and one `activate_skill` continuation, for four observed provider model calls and no
  more than the 25-call cap.
- Paid graders, judges, external-provider auxiliary research calls, and additional Flue runs:
  zero. Two repository-only Cursor planning scouts ran before the paid path; neither called the
  persona or elicitor provider.

There were no failed or aborted Flue settlements, duplicate visible user messages, incarnation
conflicts, empty assistant replies, client-executed Petrinaut tool requests, or replies selected
from latest history.

## Proof disposition

1. Controlled tool boundary: passed. Eight tests cover exact `send`/`read`, submission ids,
   incarnation uid conditioning, concurrency, no resend, empty replies, Flue failures, and bounded
   rendering.
2. Project persona discovery and restricted loadout: passed.
3. Three sequential real turns with exact submission-scoped replies: passed.
4. Independently attached read-only observer with no composer: passed after the first conversation
   admission, as required by the connected-line ordering.
5. Reload reconstruction and resumed live observation: passed.
6. Transcript visible-message order comparison: passed; canonical tool diagnostics were also
   present.
7. Normal writable chat preservation: passed.
8. App type-check, lint, unit tests, and build: passed.

## Fog-line answers and re-entry

- The topology is usable for a bounded local mechanism proof. This run does not show that it
  scales to a full elicitation or final workpiece/model.
- Generic persona instructions were sufficient for this bounded run once the situation pack was
  actually supplied inline. A reusable situation-pack transport or schema is not earned.
- The observer is useful evaluation infrastructure, but this run does not justify productizing or
  remotely exposing it.
- No client-executed Petrinaut tools were needed in three turns. Longer runs remain unproven.
- Pending-admission persistence was not needed and remains deferred.
- Canonical history plus the existing transcript CLI were sufficient; no convenience history or
  status tool is warranted.

Re-enter only for a named consumer that needs a longer run, pre-creation observer discovery,
client-tool execution, crash recovery, remote access, or broader conversation-part rendering.
