# Milestone 11: The whole pipeline

## What it adds

The command line tool that calls the four functions of the crate, and the tests that take a run through all stages. After this milestone the data of a source can be taken to the Graph by hand.

```text
hash-integrations ledger start    --definition aviation.yaml --web … --actor …     prints the run id
hash-integrations ledger capture  --web … --connector … --run … --queries capture.yaml   # open, see Open points
hash-integrations ledger prepare  --web … --connector … --run …
hash-integrations ledger send     --web … --connector … --run …
```

**Decided in:** `../plan.md`, step 2 ("a command line tool calls the stages"), step 5 ("The whole pipeline") and step 6.

## Size

|           | Lines   |                                              |
| --------- | ------- | -------------------------------------------- |
| Moved     | 0       |                                              |
| Adapted   | 20      | the app's list of subcommands and its `main` |
| New       | 240     | the subcommands with their settings          |
| **Total** | **260** | **reused 8%**                                |

The plan estimated 260. The three subcommands of hashintel/hash#10458 take 205 lines.

## Interface

Nothing in the crate changes. Each of the four functions was re-exported from `lib.rs` by the milestone that added it, with the types in its signature: `start` by 2, `capture` by 3, `prepare_incremental` by 8, `send` by 10. The app adds the crate, and `definition`, `type-system`, `hash-crypto`, `time` and `url` for the arguments, as dependencies (`dependencies.md`).

## Pseudo code

**`apps/hash-integrations/src/subcommand/ledger.rs`** (new, 240 lines)

```rust
#[derive(clap::Subcommand)]
pub enum Ledger {
    /// Start a run and print its id as JSON.
    Start(StartArgs),       // --definition <file>, --web, --actor, --id-namespace (optional)
    /// Capture the tables of a run with the operator's queries.
    Capture(CaptureArgs),   // RunArgs, and the queries: how they are given is open
    /// Turn the captured rows into entity changes.
    Prepare(RunArgs),       // --web, --connector, --run
    /// Apply the run's entity changes to the Graph.
    Send(SendArgs),         // RunArgs, --graph-url; the service secret from the environment
}

impl RunArgs {
    /// The integration's place in the bucket. A stage parses no definition to find it.
    fn storage(&self, bucket: S3Bucket) -> Result<Storage, Report<StorageError>> {
        Storage::s3(bucket, &IntegrationNamespace::new(self.web, &self.connector))
    }
}

#[derive(clap::Args)]
pub struct BucketArgs { uri, region, endpoint, use_ssl, key_id, secret }     // the secret from the environment

impl Ledger {
    pub async fn execute(self, bucket: BucketArgs) -> Result<(), Report<LedgerError>> {
        let bucket = S3Bucket::from(bucket);
        match self {
            Self::Start(args) => {
                let text = read_to_string(args.definition)?;
                let definition = Definition::from_yaml(&text)?;            // the only parse (D9)
                let namespace = IntegrationNamespace::new(args.web, definition.connector());
                let storage = Storage::s3(bucket, &namespace)?;
                let input = StartInput {
                    web: args.web,
                    actor: args.actor,
                    definition: text,
                    id_namespace: args.id_namespace,                      // None: Start uses the connector's id
                    submitted_at: OffsetDateTime::now_utc(),              // the tool reads the clock, the crate does not
                };
                println!("{}", json!({ "run": start(&storage, &definition, input).await? }));
            }
            Self::Capture(args) => capture(&args.run.storage(bucket)?, args.run.run, &read_queries(args.queries)?).await?,
            Self::Prepare(args) => prepare_incremental(&args.storage(bucket)?, args.run).await?,
            Self::Send(args)    => send(&args.run.storage(bucket)?, args.run.run, &GraphClient::new(&args.graph_url, secret)?).await?,
        }
        Ok(())
    }
}
```

A stage that fails prints its error and the tool exits with a status other than zero. The error says whether running the command again can help.

**`apps/hash-integrations/src/subcommand/mod.rs`** (adapted, 10 lines of 18): the new case `Ledger` in `Subcommand`. `execute` becomes async and returns a result.

**`apps/hash-integrations/src/main.rs`** (adapted, 10 lines of 43): `main` awaits `execute`, and exits with a status other than zero when it returns an error. Today it calls `execute` without looking at a result. hashintel/hash#10458 changes the same lines.

## Source table

| File                                              | Item                                                     | Comes from                                                                                        | Kind    | Lines |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- | ----- |
| `apps/hash-integrations/src/subcommand/ledger.rs` | `Ledger`, the argument structs, `execute`, `LedgerError` | none. hashintel/hash#10458, `subcommand/run.rs` (173), is the model for arguments and JSON output | new     | 240   |
| `apps/hash-integrations/src/subcommand/mod.rs`    | the `Ledger` case, `execute` as async                    | the same file on `main` (18)                                                                      | adapted | 10    |
| `apps/hash-integrations/src/main.rs`              | awaiting `execute`, the exit status                      | the same file on `main` (43)                                                                      | adapted | 10    |

## Tests

No existing test moves. The model is the test that runs the aviation example against a real Graph, `tests/integrations/graph/aviation/mod.rs` (from the repository's root).

**New, two tests,** in `tests/integrations/graph/ledger/` (from the repository's root), the test `ledger` of `hash-integrations-graph-tests`. They call the four functions, not the command line tool. Capture reads two CSV files, `aircraft.csv` and `airfields.csv`, with the queries of `capture.yaml`, which stands for the operator's configuration.

1. **`csv_to_graph`, a run through all stages,** against a MinIO container and a Graph that the test serves: Postgres from a container, migrated and seeded with the aviation ontology, and the Graph's REST router on a free port. After Send the Graph holds the two aircraft, the two airfields and the two links, each link ends at an airfield, and every entity is read-only. A second Send of the completed run changes nothing.
2. **`csv_to_local_graph`, the same run against the local HASH stack,** so that its entities show in the HASH UI. It is ignored unless asked for, because the stack must be running. The Graph, its database and the bucket come from the repository's `.env` files.

Running a stage twice is tested where the stage is: Capture in milestone 3, Prepare in milestone 8, Send in milestone 10. It is not repeated here.

The command line tool itself has no test. It parses arguments and calls four functions.

## What was stripped

Nothing existing. Not built, as decided: the orchestration interface and the service with `submit`, `status` and `cancel` (`../plan.md`, step 2), a queue, and a command to give up a run (D7).

## Open points

- **Chosen:** the id namespace defaults to the connector's id, as labs does (`../background/flow-map.md`, "Entity id and link id"). Start fills it in from the definition it is given.
- **Chosen:** `start` parses the definition, because it needs the connector to open the storage, and hands the parsed definition to the crate (D9). Capture, Prepare and Send are given the web and the connector, which name the integration's place in the bucket, and parse nothing to open it.
- **Chosen:** the settings of the tool are what the four functions need and nothing else: the bucket (address, region, endpoint, key id; the secret from the environment), and for `send` the Graph's address and the service secret from the environment.
- **Open:** how the tool is given Capture's queries. The tests read a YAML map of each table to its DuckDB query (`capture.yaml`), and the sketch above assumes the tool reads such a file, but that is not decided. A query runs with the bucket's credentials, so it comes from the operator's configuration, never from the definition (D18).
- **Chosen:** one error type, `LedgerError`, for what the tool itself can fail at: reading and parsing the definition file, and the settings. A stage's error is printed as it is.
- **Chosen:** the tool prints the run id of `start` as JSON, as the subcommands of hashintel/hash#10458 do, and prints nothing for the three stages when they succeed.
- **Chosen:** the tests of the whole pipeline call the crate's functions. The tool adds only argument parsing.
- **Fact:** `apps/hash-integrations` on `main` has two files of subcommands, 39 lines, and one subcommand, `completions`.
- **Decided:** D15, the tool lives in the existing app as `hash-integrations ledger …`.
