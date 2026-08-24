# Linear migration review: FE-1401

Generated: 2026-08-20T09:03:34Z
Issues: 4

## FE-1401

**Title:** Resolve the follow-ups from the stack legibility session → Resolve the stack legibility follow-ups

**Current outer**

I'm running a read-through of the open stack (FE-1374 up to FE-1390), aimed at regaining legibility over the top four branches before they land. The read-through is already surfacing more than branch understanding: process insights, a doc drift, and a couple of tooling ideas worth carrying forward. This issue is the resolution sweep for that session — everything we uncover, solve, design, or decide gets captured here and driven to a resolution, so the session's yield doesn't evaporate when the context does.

The session is in progress; items accrue below as they surface. Anything that grows real work graduates to its own sub-issue.

**Proposed outer**

A read-through of the open stack from FE-1374 through FE-1390 is restoring a shared understanding of the top four branches before they land. It is also identifying process lessons, documentation drift, and tooling ideas that need a durable resolution. This issue records and resolves each finding so that the session's results remain available after the working context ends.

The session is still in progress. Findings accumulate in the execution record, and any finding that requires substantial work becomes a sub-issue.

**Extraction:** `standalone-divider`

**Inner record:** 3285 characters; SHA-256 `f99c1280b8f7c73cd932a953bf8a8df0651f655b393f773cc88d46d0e49da113`

**Ambiguity:** None.

## FE-1424

**Title:** The documentation protocol runs end to end: inbox settled, planning reshaped, index gated, arc-close triggerable → Complete the documentation protocol

**Current outer**

None. The unheaded numbered source body is the execution record.

**Proposed outer**

The repository's documentation rules defined where files belong and how each work arc closes, but the project had not applied them end to end. This issue carries out the rules and incorporates the amendments Lu approved on 2026-08-17.

The work settles all seven inbox documents, reorganizes shared and effort-specific planning files, and adds a test for complete index coverage and directory structure. It also combines the three arc-close procedures and establishes how living documents reference issues and repair stale status language. Freshness remains a procedural review because a mechanical check could report success without proving that the text is current.

**Extraction:** `whole-body-as-inner`

**Inner record:** 1573 characters; SHA-256 `25338da8862bddb99fe1703004fd71da6f90c544df8a3026c5ac2db39bdc8451`

**Ambiguity:** None. The unheaded numbered body is the issue's execution record, so the migration preserves the complete source body inside Agent notes.

## FE-1432

**Title:** The stack's open review threads are adjudicated: fixed, owned, or refused on the record → Resolve the stack's open review threads

**Current outer**

A cross-stack review of the unresolved inline PR threads ran 2026-08-18: 24 threads across 10 PRs, of which 9 were resolved with evidence-backed upstack replies and 15 remain open. The review also induced five reusable lenses, and the findings that survived under them are concrete: two capture-store closure gaps (overlapping conflicts can strand one another, and the persisted parser accepts a duplicate `issue-closed` event the command API refuses to produce), two completion-metadata drops (expert truncation is discarded, and a non-final interviewer response can stay truncated past the continuation cap without being marked incomplete), a boundary-honesty gap (`plugin-gherkin` declares `valibot` without importing it, and the boundary test checks the dependency relation in one direction only), and two test-setup holes (the capture-store test ignores setup results and leans on non-null assertions; the walking-skeleton integration test can throw while inspecting an absent reply context).

FWIW several of these are not new discoveries — they are FE-1419's deliberate out-of-scope list coming due (unused-dependency cleanup, expert-truncation handling, advisory-loop tuning were all named there and deferred). This ticket is the FE-1401-style consolidation point: done means every row in the queue document lands in a commit, moves to a named owner, or is refused with a reply on its PR thread — and the 15 still-open threads each get the same adjudication.

**Proposed outer**

A review on 2026-08-18 covered 24 unresolved inline threads across 10 PRs. Nine threads now have evidence-backed replies, while 15 remain open. The review found two capture-store closure problems, two cases where completion metadata is lost, one dependency-check problem, and two unsafe test setups.

Several findings repeat work that FE-1419 explicitly deferred. This issue is complete when every queue entry and each remaining thread is fixed in a commit, assigned to a named owner, or declined with a reply on the PR thread.

**Extraction:** `standalone-divider`

**Inner record:** 552 characters; SHA-256 `0fbd1bee2c01279349d7153444b398ce50eed5c2b1858847aa457ba5eff62a02`

**Ambiguity:** None.

## FE-1451

**Title:** Keep issues, comments, and PRs easy to scan → Keep issues, comments, and PRs easy to scan

**Current outer**

Teammates have said that agent-written issues, comments, and PR descriptions are too long and too jargon-heavy to scan. This issue changes the writing rules: every issue and PR keeps a short plain-language summary first, and the agent's working detail moves into a section that Linear and GitHub render collapsed. Comments use one or two sentences to say what changed or was decided, with longer details in `🏗️ Agent notes`. The wording rules align with the house technical-writing guidance drafted in [hashintel/internal-agents PR #20](https://github.com/hashintel/internal-agents/pull/20). The change is ready for review in [brunch-lite PR #23](https://github.com/hashintel/brunch-lite/pull/23).

**Proposed outer**

Teammates have said that agent-written issues, comments, and PR descriptions are too long and too jargon-heavy to scan. This issue changes the writing rules: every issue and PR keeps a short plain-language summary first, and the agent's working detail moves into a section that Linear and GitHub render collapsed. Comments use one or two sentences to say what changed or was decided, with longer details in `🏗️ Agent notes`. The wording rules align with the house technical-writing guidance drafted in [hashintel/internal-agents PR #20](https://github.com/hashintel/internal-agents/pull/20). The change is ready for review in [brunch-lite PR #23](https://github.com/hashintel/brunch-lite/pull/23).

**Extraction:** `existing-agent-notes`

**Inner record:** 2952 characters; SHA-256 `5f7e7ccafc96dae7ca37a344d1196404fc760e3443ad6370e4e05ddb530062b2`

**Ambiguity:** None.

**Notes:** The source opener contains a space after +++; the proposed body normalizes only that structural opener.
