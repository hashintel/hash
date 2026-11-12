# HASH Integrations Orchestration

Runs integrations as sequences of durable steps.

A run calls a run function, which requests its steps by name. Each completed step is recorded with its output. When a run is executed again, its recorded steps return their outputs without executing, and the run continues from the first step that has not completed. A run function must request the same steps in the same order each time. A request that differs from the recorded step fails the run as non-deterministic.

`RunState` starts from a run's `RunStart` and applies its `RunEvent`s in order. `RunState::decide` decides what a step request does: replay the recorded output, execute the step, or cancel the run. A failed step is executed again no earlier than the delay of the run's `RetryPolicy` allows, until it succeeds, fails permanently, or reaches `max_attempts`. A cancel request stops the run at its next step that has not been recorded. `RunState::apply` rejects an event that cannot follow the recorded events, and `decide` rejects a request on a finished run.

Run inputs and step outputs are `Payload`s: JSON encoded by `Payload::encode` and compared by their bytes. Maps in a payload are `BTreeMap`s, whose keys encode in sorted order, so a value encodes to the same bytes each time. A journal returns a payload's bytes exactly as they were written, so a PostgreSQL journal stores them as `text` or `bytea`, since `jsonb` reorders keys.

Step outputs and failures are stored with the run. A step resolves the secrets it needs itself and never returns them. A failure records a `FailureCode` such as `graph-unavailable`. Error messages can quote secrets or row values, so they go to logs.

A run records the `FunctionVersion` of the run function that started it, and an `AdmissionKey` that names the runs that must not be active at the same time. `RunState` takes every timestamp from its recorded events, so the same events always produce the same state. The caller of `decide` compares a step's `not_before` with its own clock.

A backend implements three traits. `Runs` starts, reads and cancels runs without a worker. `Worker` executes runs, and resumes a run that a stopped process was executing. `CoordinationStore` holds token buckets shared by every process, for the Graph rate limit. A backend executes a `RunFunction`, which requests its steps through a `StepContext`.

Each storage adapter maps these types to a versioned stored format of its own and pins that format with tests.
