# A3 browser witness — blocked, not performed

No real browser transition is claimed by this branch. No screenshot or browser-observed canonical pre/post definition was produced. `canonical-pre.handle.json`, `canonical-post.handle.json`, and `transition-records.handle.json` are separately labelled canonical-handle observations from the unpaid script in this directory; the panel regression is jsdom component evidence.

## Boundary established so far

The published panel now offers an optional synchronous `aiAssistant.executeMutation` hook around its existing canonical mutation helper, after ready-state execution admission, read-only checking and canonical input validation, and before matching output insertion. Its guarded `execute()` can run once and cannot be retained past the hook's return or exception. Existing generation/conversation checks, Stop withholding, StrictMode timer cleanup, output insertion and continuation remain the panel's responsibility.

The website adapter reads its own bound `PetrinautDocHandle.doc()` immediately before invoking that guarded executor and immediately after it returns or throws. Neither React's rendered definition nor tool-chunk arrival supplies these snapshots. Hashing and execution are synchronous; async layout and host-owned title changes are deliberately excluded. The panel/helper and real core handle tests establish this component boundary, not that the website mounts it.

## Remaining production join

The inherited website does not register this hook. It also has no issued mutation envelope carrying a requested base hash and document incarnation: ordinary client-tool registration only names documentation/question tools, while the prepared fixture separately names `getLatestNetDefinition` and `addArc`. The existing settled manifest records document ID/hash, not incarnation. Inventing those values from the execution-time observation would falsify the requested-base/binding contract.

The integration owner must supply the bound incarnation and issued-request lookup, mount the adapter on the existing website route, and join its record to the existing correlated client result. See `integration-owner.md`. A2's settled revision/citation protocol and the basis join remain independent prerequisites. No new tool, route, agent, provider runner or persistence sidecar was added to make the witness easier.

## Atomicity limits

The inspected JSON handle performs each canonical mutation synchronously, then emits its committed state synchronously. There is no await between the adapter's snapshots and mutation. This excludes ordinary browser event-loop interleaving in that interval, but is not a cross-tab, cross-process or remote-document transaction guarantee. Synchronous subscriber reentrancy is not locked out; residual changes are accounted for and produce `unknown`, not inherited basis. An asynchronous/custom handle that settles later has not earned this boundary. A joined real browser must verify the actual selected handle and record before claiming the oracle passes.

## Next witness

Use an isolated local origin, database and principal, a clearly labelled test document, and a controlled provider on the existing built production ChatAgent mount. Have its issued request carry the separately supplied base/binding; independently inspect the actual browser pre/post document and the emitted transition record. Capture `transition-records.json`, canonical browser definitions, screenshots, and the canonical result/continuation correlation. Replay the delivery and show no second application. Inspect the real browser, not a simulated DOM. The exact prospective assertion `correlates the real browser transition record and resumes without reapplying` remains blocked and is not replaced by a skipped or weaker headless test.

No paid calls were allocated or made. The shared A1 ledger remains untouched. A paid witness requires the integration owner's reservation and complete live baseline including A2's revision tool.
