# Persona/browser join — integration checkpoint

## Result and scope

The existing persona extension can attach to a browser-created Brunch session. An actual Chrome witness shows persona-seam utterances, replies and two source-linked workpiece revisions together without reload, then reloads and continues through the ordinary UI in the same session. Eleven synthetic provider requests produce four canonical user messages. Production queries supply source IDs/locators; production tools settle revisions. Test-authored utterances and provider replies are explicitly synthetic, not a rich persona interview or semantic/PM acceptance.

Operator attachment uses a private allowlisted capture of the browser's endpoint, ownership, initialization binding and actual runtime UID. It verifies the canonical binding, then sends conditional continuation without initialization data. Manual DevTools capture remains developer setup. Browser-mode persona tools are host-none: this checkpoint does not host persona-requested browser mutations.

## Review and corrections

Independent review found the Brunch synthetic path working, but demonstrated that generic live-following interactive tools could consume ordinary composer input. The correction applies existing local-stream authority to composer routing and widget completion, including layout consent. Observed/reloaded tools remain display-only; local-streamed and default-mode interactions retain their behavior. The original failing counterexample passes unchanged after correction, and owning regression tests retain the discriminator.

Review also found initialization cleanup outside the caller's resource scope. App acquisition and browser setup now sit inside independent cleanup; fetch restores and the app stops on browser setup failure, and helper server cleanup runs even if browser close rejects. Three controls fail against the pre-correction source and pass against the corrected source. Rejected browser cleanup remains explicitly incomplete, not evidence of OS process termination.

The parent reviewed the correction source and reran 49 app/persona/cleanup/architecture tests, 70 panel tests and 12 tracker tests: **131 passed**, plus the original independent interactive-tool control: **one passed**. The cleanup test imports no Flue/Pi substrate directly, so it needs no additional exact-import inventory entry. `git diff --check` passes.

## Verification provenance

- Independent review: `/tmp/persona-review-1788949367/review.md`; 94 source tests and a fresh sandboxed Chrome witness before the correction. Its original failing interactive control is preserved there.
- Correction: `/tmp/persona-correction-1788949725/result.md`, `correction.diff`, source hashes, baseline reds and command logs. Seventy panel and three cleanup tests; affected type/lint checks passed. Fresh corrected Petrinaut/website builds and persona/root Chrome witnesses passed.
- Corrected persona witness: `/tmp/m7-persona-browser-yVsRMH/`; parent inspected `revision-2.png`. Root regression: `/tmp/m7-root-creation-DWKmMz/`, 38 checked callbacks, 52 synthetic requests, seven applied operations.
- Parent logs: `/tmp/persona-parent-review/{app,panel,transport,independent-control}.log`.

These temporary paths identify local execution evidence, not durable archival promises. Executable discriminators live beside their owning source; no build/session forest is copied into this packet. The corrected website build used a temporary copy of its configuration with environment loading disabled and the synthetic mount `/agents/chat`; source-map alignment was checked for the corrected panel. This is not a standard deployed-image or complete Pi CLI-loader proof. The incorrect earlier build cwd/mount attempts remain in the correction packet and earn no success credit.

## Next product observation

Unit 1 remains incomplete: use an actual persona and context pack to develop a sophisticated account through this route, inspect workpiece cadence/content and correctability, and curate a session worth continuing. The current raw-Markdown diagnostic pane establishes visibility, not rich-workpiece readability or teammate-ready presentation. The credential/accounting stop remains unchanged: six attempts, one unknown, US$7 held; no provider call, credential operation, ledger mutation or allocation occurred here.

Fixture export/seeding, remote deployment, process-restart recovery, simultaneous writers, persona browser mutation hosting and final semantic/utility acceptance remain unearned. Missing retained settlement associations deliberately refuse live replacement rather than infer canonical catch-up.
