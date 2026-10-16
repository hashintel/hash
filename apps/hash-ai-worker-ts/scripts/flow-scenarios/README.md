# Flow scenarios

A scenario is a flow definition, its inputs and the outputs you expect. `run-flow-scenario` runs it end to end
through Temporal on the local stack, the way the `startFlow` resolver starts a run, checks every expectation and
prints a report you can paste into a PR.

## Start the stack

```bash
yarn compose --profile hgres up -d             # infrastructure and the graph, in Docker
yarn dev:backend                                # once, to run migrations and seed the alice and bob01 users
yarn workspace @apps/hash-ai-worker-ts dev      # the worker for the `ai` task queue
yarn workspace @apps/hash-integration-worker dev  # the worker for the `integration` task queue, if the flow needs it
```

The workers import `@local/hash-isomorphic-utils` and `@local/hash-backend-utils` from their builds, so rebuild a
library after changing it (`yarn workspace @local/hash-isomorphic-utils build`). The runner warns when a build is
older than its source, and stops if the worker polling the task queue runs from another checkout.

## Write a scenario

Copy [`scenarios/array-actions.scenario.ts`](scenarios/array-actions.scenario.ts) and edit it. A scenario exports
`scenario = defineScenario({ ... })` with:

- `flow`: built with `defineFlow` from `@local/hash-isomorphic-utils/flows/define-flow`. Give it a
  `flowDefinitionId` of its own: the runner stores the definition as a `Flow Definition` entity with that uuid in
  the user's web, and updates it when the definition changes, because runs load their definition from the graph.
- `inputs`: a `{ kind, value }` payload for each flow input.
- `expect`:
  - `status`: the run's status, `COMPLETED` by default.
  - `outputs`: the flow's output values by name, without the `{ kind, value }` wrapper.
  - `steps`: by step id, the step's `status` (`COMPLETED` by default; `FAILED`, `SKIPPED`…), its `outputs`, and
    `absentOutputs` it must not produce, such as the branch an If didn't take.
- `user`: the shortname to run as, in their own web. `alice` by default.

Work out the expected values by hand before running, rather than copying them from a run. Values are compared
exactly.

## Run it

```bash
yarn workspace @apps/hash-ai-worker-ts run-flow-scenario scripts/flow-scenarios/scenarios/array-actions.scenario.ts
```

The scenario path is relative to `apps/hash-ai-worker-ts`. `--dry-run` only validates the definition, without the
stack. `--timeout <seconds>` (300 by default) reports the steps so far if the run hasn't finished by then.

The report is printed and saved to `runs/<time>-<name>/report.md`, with the raw flow run in `flow-run.json` when an
expectation fails. The exit code is 0 when every expectation is met, 1 when one isn't, and 2 when the scenario
couldn't be run, for example because no worker is polling the task queue.
