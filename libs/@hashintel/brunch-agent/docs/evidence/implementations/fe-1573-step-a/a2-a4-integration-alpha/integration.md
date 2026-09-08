# Combined A2–A4 integration baseline

## What was integrated

At Lu's request, the settled worker candidates and their evidence are now together on `ln/fe-1573-construct-and-explain`. This joins their source and tests, **not the still-missing production provenance flow**.

| Contribution | Source and integration |
| --- | --- |
| A2 revision settlement | Already merged through `8c3083f8d5` by `b3ab2df3db`; remains Partial with the ordinary mixed-batch safety assertion red. |
| A3 synchronous host observation and narrow root-arc record candidate | Merged `2ed0e1ded7` with its implementation parent `0ff1f8f0e4` as `96e74b2c3c`. |
| Preliminary A4 history/compaction/reopen tests and evidence | Cherry-picked only `8493526924` and `1fb8e96ffe` as `413366b583` and `c15f779486`, with source attribution. Did not duplicate the already-owned compaction and authority patches. |

The tested combined HEAD is **`c15f779486`**. No merge conflict required a manual source resolution. All compaction, A2 and A4 hermetic-test inventory entries remain present; exact-set equality passes. A3's existing-workspace dependency, lockfile edge, task mirror, public patch changeset and user-guide update are retained. `yarn install --immutable` passed with peer-dependency warnings and no tracked changes.

The optional Petrinaut mutation executor remains absent from stock behavior unless supplied by its host. The website's Brunch recorder is still **not registered**; its successful component/handle tests are not browser proof. No generated basis envelope, document incarnation, issued-request map or result-carriage mechanism was invented to make this merge look integrated.

## Combined verification

Executed from the root in a dedicated Herdr shell pane using Node **v22.21.1**, avoiding A3's previously observed shell-tool Unix-socket restriction:

```sh
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force
```

**Exit 1; 62/63 tasks successful; zero cache hits.** Every selected build, typecheck and lint task passed. The only failed task is the app suite's unchanged mixed-batch safety assertion.

| Package | Tests |
| --- | --- |
| Core | 103 passed |
| SDCPN plugin | 20 passed |
| Flue binding | 20 passed |
| AI SDK transport | 42 passed |
| Brunch app | 180 passed / 1 failed |
| Petrinaut | 692 passed |
| Petrinaut website | 373 passed |
| **Total** | **1,430 passed / 1 failed** |

`verification.log` retains full output, with terminal styling removed but all failures preserved. The failed assertion is `apps/brunch-agent/test/workpiece-revisions.test.ts` → `mixed workpiece and browser tool batch does not apply a mutation`. It is neither skipped nor converted into expected-failure behavior. The existing-tool A4 threshold/reopen wrapper passes on this same build, alongside A2's new revision mount. It still does not exercise compaction of actual revision or browser-transition records.

Additional checks:

- `yarn workspace @local/petrinaut-arch-docs lint:arch-docs`: exit 0, **70 layers / 356 edges** (`architecture.log`).
- Root `oxfmt --check` on the 15 imported TypeScript/TSX paths plus the public guide and changeset: exit 0, **17 files** (`format.log`).
- `git diff --check b3ab2df3db HEAD -- '*.ts' '*.tsx' '*.md'`: exit 0. Raw evidence logs are not reformatted for whitespace.
- Existing app/binding/transport lint warnings remain non-blocking; no new lint failure was introduced.

No full repository CI, remote deployment, actual browser witness or paid provider run was performed.

## Separate overflow discriminator

Repeated A4's committed failing instrument against the combined build in a newly created disposable directory:

```sh
A4_DIR=$(mktemp -d /tmp/brunch-joined-overflow-XXXXXX)
A4_OUTPUT_DIRECTORY="$A4_DIR" A4_OVERFLOW_PROBE=1 yarn workspace @apps/brunch-agent exec node --experimental-strip-types test/history-retention.integration.ts
```

**Exit 1, reproduced:** runtime reports a successful overflow compaction from **20 to 3 messages**, followed by `Cannot continue from message role: assistant`. This is separate from the suite's mixed-batch failure; no green-suite result hides it. Retained here: `overflow.log`, `overflow-create-events.json`, `overflow-create-final-history.json`, and `overflow-create-shutdown.json`. The manifest records the combined HEAD, selected source/build hashes, evidence hashes and original disposable output directory. The database remains local, not a portable history export. No sibling or live database was opened.

This error does not establish source loss or authorize archive repair. The preliminary retained-store route remains viable; the overflow continuation path needs its own runtime disposition.

## Remaining production joins

The existing mission remains the authority. This merge does not settle these dependencies:

1. **Batch admission:** enforce revision/construction separation while preserving non-terminating revision and marker behavior. A2's red mounted oracle is the discriminator; prompts and sibling order are not a guard.
2. **Issued binding and browser record carriage:** supply stable document incarnation and issued base/input lookup, mount A3's recorder only over its earned operation class, and carry records with the existing causal client result while preserving canonical result identity. A1's real `addType` proof does not confer provider-carrier admission on A3's narrow `addArc` recorder.
3. **Actual browser witness:** run the registered execution/result/continuation path, including duplicate delivery and protected Voice/Stop behavior. Current handle/component observations cannot substitute.
4. **A4 new-record recheck:** generate actual settled A2 revisions and A3 browser records through the joined path, then repeat folding and fresh-process reopen. An integrated build containing both test files is not this proof.
5. **A5 and later gates:** authorized evidence, settled citation/basis, live reconciliation, model-facing why and the real pane remain to be joined before the genuine tracer. Neither interim worker handoff authorizes acceptance or Step B.

The unrelated untracked Voice-delegation design document and all sibling worktrees were left untouched. No paid calls, budget changes, push, branch rewrite or cleanup of other workers' resources.
