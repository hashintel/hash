# Restate backend

This folder executes integration runs on [Restate](https://restate.dev). It implements the orchestrator's four traits, so a run function written against `StepContext` runs on it unchanged.

Restate is a server. It stores every run with a journal of the run's steps, and it calls our workers to execute the runs. Our code writes no journal, takes no lease and has no recovery logic. Restate does all three.

## The three parties

```text
client ──start──▶ Restate ──HTTP/2 stream──▶ worker
                 (journal) ◀──step results──
```

| Party   | What it is                                                                          | Code                   |
| ------- | ----------------------------------------------------------------------------------- | ---------------------- |
| Client  | Any process that starts, reads or cancels a run. It sends HTTP requests to Restate. | `runs.rs`, `status.rs` |
| Restate | The server. It stores the runs and decides which worker executes which run.         | Not ours               |
| Worker  | A process that holds our run function. It serves HTTP, and Restate calls it.        | `worker.rs`, `run.rs`  |

A client and a worker never talk to each other. A worker has no ID, and Restate keeps no list of workers. It only knows URLs.

## The flow of one run

1. **A worker registers.** `worker.rs` starts an HTTP server and tells Restate its URL. Restate asks that URL which handlers it serves.
2. **A client starts a run.** `runs.rs` sends one request to Restate. Restate stores the run before it answers, whether or not a worker is running.
3. **Restate calls the worker.** It opens a stream to the worker's URL and sends the run's input together with the journal so far. The `IntegrationRun` handler in `run.rs` receives the call.
4. **The run function requests its steps.** Each `StepContext::run` call becomes a Restate step in `run.rs`. A step that is in the journal returns its recorded result without executing. A step that is not in the journal executes, and Restate journals its result before the function continues.
5. **Something fails.** If the worker dies, or a step runs past the step timeout, Restate calls the URL again. The run function starts from the top with the journal, so only the unfinished steps execute. If a step returns a retryable failure, Restate retries it as the run's retry policy says.
6. **The run finishes.** The handler returns and Restate stores the outcome. `status.rs` reads it.

## Restate terms

- **Journal.** The results of a run's finished steps, in order. Restate writes an entry when a step returns. A run function never touches it.
- **Virtual Object.** A handler that is addressed by a key. Restate executes one call per key at a time and keeps stored state for each key. We use two. `IntegrationRun` is keyed by the admission key, so two runs with the same admission key never execute at the same time. `TokenBucket` is keyed by the bucket's scope and keeps the balance as its state, so the shared rate limit needs no table and no lock.
- **Idempotency key.** A key a client sends with a request. We send the run's ID, so starting the same run again attaches to the run that exists.
- **Deployment.** A worker URL that is registered with Restate. Each version of the run function has a URL of its own. New runs go to the URL registered last, and a running run stays on the URL it started on.

## Files

Each file implements one trait of the orchestrator.

| File              | Implements                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `mod.rs`          | `RestateConfig`, which a client needs, `WorkerConfig`, which only a worker needs, and the backend struct |
| `worker.rs`       | `Worker` on `RestateWorker`: serve the handlers and register the URL                                     |
| `run.rs`          | The `IntegrationRun` handler, which calls the `RunFunction` and is its `StepContext`                     |
| `runs.rs`         | `Runs`: start and cancel a run, one request each                                                         |
| `status.rs`       | The status of a run, read from the tables of Restate's admin API                                         |
| `token_bucket.rs` | `CoordinationStore`: the token bucket object                                                             |

## What to keep in mind

- **A step can execute twice.** If a worker dies after a step wrote to an outside system and before Restate journaled the result, the step executes again. That write has to be safe to repeat.
- **A retry starts the run function from the top.** Anything a later step needs is in an earlier step's result, or in durable storage that the result points to. Memory and local files of the previous attempt are gone.
- **Status is read from admin tables.** Restate tells a client whether a call has finished, and nothing about its progress. So `status.rs` reads the phase and the step count with SQL from Restate's admin API.
- **`start` leaves competing starts to Restate.** A run that is started again attaches to the existing run and keeps its first input, even when the second start has another one. A run under a busy admission key waits for it. The backend returns neither `StartMismatch` nor `AlreadyActive`.
- **A cancelled run needs a worker to end.** Restate records the cancel at once, but a run that no worker has begun stays pending until a worker picks it up. It then ends cancelled before its first step.
- **A renamed step does not fail the run.** Restate notices that the journal no longer matches the code, retries the run and then pauses it.

## Try it

Start a Restate server:

```sh
docker run --rm -p 8080:8080 -p 9070:9070 --add-host=host.docker.internal:host-gateway \
    docker.restate.dev/restatedev/restate:1.8.1
```

Run one run of three steps and watch it in Restate's UI at <http://localhost:9070/ui>:

```sh
cargo run -p hash-integrations-orchestration --features restate --example restate_run
```

Run the tests, which cover a killed worker, a hung step, retries, cancellation and two versions side by side:

```sh
cargo nextest run -p hash-integrations-orchestration --features restate --test restate
```
